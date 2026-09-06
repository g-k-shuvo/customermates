import { describe, expect, it } from "vitest";

import {
  buildOwnerLookup,
  decideClosingTransition,
  distinctLostReasons,
  formatDealFieldValue,
  isCustomDealField,
  mapActivity,
  mapActivityKind,
  mapDeal,
  mapDealFieldToCustomColumn,
  mapNoteToMarkdown,
  mapOrganization,
  mapPerson,
  mapPipeline,
  mapPipelineStages,
  noteOwner,
  orderStageChanges,
  parseActivityDueAt,
  parseActivityDurationMinutes,
  parseImportedNoteIds,
  personEmailIdentifiers,
  resolveOwner,
  serializeImportedNoteIds,
  splitPersonName,
  stageReplayPlan,
} from "../mapping";
import { contactPointValues, parseDealStatus, parsePipedriveDate, referenceId } from "../pipedrive.types";

const CUSTOM_FIELD_KEY = "a".repeat(40);

const owners = buildOwnerLookup({
  pipedriveUsers: [
    { id: 1, email: "Ada@Example.com" },
    { id: 2, email: "ghost@example.com" },
    { id: 3, email: null },
  ],
  targetUserIdByEmail: new Map([["ada@example.com", "user-ada"]]),
  fallbackUserId: "user-fallback",
});

describe("pipedrive readers", () => {
  it("reads ids out of every reference shape", () => {
    expect(referenceId(7)).toBe(7);
    expect(referenceId("7")).toBe(7);
    expect(referenceId({ value: 7, name: "Acme" })).toBe(7);
    expect(referenceId({ id: 7, email: "a@b.c" })).toBe(7);
    expect(referenceId(null)).toBeNull();
    expect(referenceId({ value: null })).toBeNull();
  });

  it("parses Pipedrive timestamps as UTC rather than local time", () => {
    expect(parsePipedriveDate("2024-03-05 11:22:33")?.toISOString()).toBe("2024-03-05T11:22:33.000Z");
    expect(parsePipedriveDate("2024-03-05")?.toISOString()).toBe("2024-03-05T00:00:00.000Z");
    expect(parsePipedriveDate("not a date")).toBeNull();
    expect(parsePipedriveDate(null)).toBeNull();
  });

  it("treats unknown deal statuses as deleted", () => {
    expect(parseDealStatus("won")).toBe("won");
    expect(parseDealStatus("LOST")).toBe("lost");
    expect(parseDealStatus("deleted")).toBe("deleted");
    expect(parseDealStatus(undefined)).toBe("deleted");
  });

  it("reads contact points from arrays and bare strings", () => {
    expect(contactPointValues([{ value: "a@b.c" }, { value: "" }, { value: "a@b.c" }])).toEqual(["a@b.c"]);
    expect(contactPointValues(" +49 30 1 ")).toEqual(["+49 30 1"]);
    expect(contactPointValues(null)).toEqual([]);
  });
});

describe("owner mapping", () => {
  it("matches a Pipedrive user to the target user with the same email", () => {
    expect(resolveOwner(1, owners)).toEqual({ userIds: ["user-ada"], usedFallback: false, unmatched: null });
  });

  it("falls back to the nominated owner and reports the unmatched email", () => {
    expect(resolveOwner(2, owners)).toEqual({
      userIds: ["user-fallback"],
      usedFallback: true,
      unmatched: { pipedriveUserId: 2, email: "ghost@example.com" },
    });
  });

  it("reads the email out of an expanded owner reference", () => {
    expect(resolveOwner({ id: 9, email: "Nobody@Example.com" }, owners).unmatched).toEqual({
      pipedriveUserId: 9,
      email: "nobody@example.com",
    });
  });

  it("leaves the record unassigned when no fallback owner is configured", () => {
    const withoutFallback = buildOwnerLookup({
      pipedriveUsers: [{ id: 2, email: "ghost@example.com" }],
      targetUserIdByEmail: new Map(),
      fallbackUserId: null,
    });

    expect(resolveOwner(2, withoutFallback)).toEqual({
      userIds: [],
      usedFallback: false,
      unmatched: { pipedriveUserId: 2, email: "ghost@example.com" },
    });
  });

  it("assigns nobody when the source record has no owner at all", () => {
    expect(resolveOwner(null, owners)).toEqual({ userIds: [], usedFallback: false, unmatched: null });
  });
});

describe("organization mapping", () => {
  it("stamps the Pipedrive id and the address onto custom columns", () => {
    const mapped = mapOrganization(
      { id: 11, name: "  Acme  ", address: "1 Main St", owner_id: 1 },
      { pipedriveIdColumnId: "col-id", addressColumnId: "col-address" },
      owners,
    );

    expect(mapped).toMatchObject({
      skipped: false,
      payload: {
        name: "Acme",
        userIds: ["user-ada"],
        customFieldValues: [
          { columnId: "col-id", value: "11" },
          { columnId: "col-address", value: "1 Main St" },
        ],
      },
    });
  });

  it("skips a nameless organization", () => {
    const mapped = mapOrganization(
      { id: 12, name: "   " },
      { pipedriveIdColumnId: "col-id", addressColumnId: null },
      owners,
    );

    expect(mapped).toEqual({ skipped: true, reason: "organization has no name" });
  });
});

describe("person mapping", () => {
  it("prefers the explicit name parts", () => {
    expect(splitPersonName({ id: 1, first_name: "Ada", last_name: "Lovelace", name: "ignored" })).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("splits a single name field on the first space", () => {
    expect(splitPersonName({ id: 1, name: "Ada Byron Lovelace" })).toEqual({
      firstName: "Ada",
      lastName: "Byron Lovelace",
    });
  });

  it("keeps a mononym as the first name", () => {
    expect(splitPersonName({ id: 1, name: "Prince" })).toEqual({ firstName: "Prince", lastName: "" });
  });

  it("keeps only plausible email identifiers", () => {
    expect(personEmailIdentifiers({ id: 1, email: [{ value: "ada@example.com" }, { value: "not-an-email" }] })).toEqual(
      [{ provider: "mail", value: "ada@example.com" }],
    );
  });

  it("links the organization and reports one that was never imported", () => {
    const linked = mapPerson(
      { id: 5, name: "Ada Lovelace", org_id: { value: 11, name: "Acme" }, phone: [{ value: "+49 30 1" }] },
      { pipedriveIdColumnId: "col-id", phoneColumnId: "col-phone" },
      owners,
      new Map([[11, "organization-1"]]),
    );

    expect(linked).toMatchObject({
      skipped: false,
      missingOrganizationId: null,
      payload: {
        organizationIds: ["organization-1"],
        customFieldValues: [
          { columnId: "col-id", value: "5" },
          { columnId: "col-phone", value: "+49 30 1" },
        ],
      },
    });

    const orphan = mapPerson(
      { id: 6, name: "Grace Hopper", org_id: 99 },
      { pipedriveIdColumnId: "col-id", phoneColumnId: null },
      owners,
      new Map(),
    );

    expect(orphan).toMatchObject({ skipped: false, missingOrganizationId: 99 });
  });

  it("skips a person with no usable name", () => {
    expect(
      mapPerson({ id: 7, name: "  " }, { pipedriveIdColumnId: "col-id", phoneColumnId: null }, owners, new Map()),
    ).toEqual({ skipped: true, reason: "person has no name" });
  });
});

describe("pipeline and stage mapping", () => {
  const stages = [
    { id: 20, name: "Qualified", order_nr: 2, deal_probability: 40, rotten_flag: true, rotten_days: 14 },
    { id: 10, name: "Lead in", order_nr: 1, deal_probability: 10 },
  ];

  it("orders stages by order_nr and appends the terminal pair", () => {
    expect(mapPipelineStages(stages, { won: "Won", lost: "Lost" })).toEqual([
      { name: "Lead in", probability: 10, rottingDays: null, kind: "open" },
      { name: "Qualified", probability: 40, rottingDays: 14, kind: "open" },
      { name: "Won", probability: 100, rottingDays: null, kind: "won" },
      { name: "Lost", probability: 0, rottingDays: null, kind: "lost" },
    ]);
  });

  it("ignores rotting days when Pipedrive has the rotten flag off", () => {
    const mapped = mapPipelineStages([{ id: 1, name: "Idle", rotten_days: 30 }], { won: "Won", lost: "Lost" });

    expect(mapped[0]).toMatchObject({ rottingDays: null });
  });

  it("builds a create-pipeline payload", () => {
    const mapped = mapPipeline({ id: 1, name: "Sales", order_nr: 3 }, stages, {
      isDefault: true,
      terminalNames: { won: "Won", lost: "Lost" },
    });

    expect(mapped).toMatchObject({ skipped: false, payload: { name: "Sales", position: 3, isDefault: true } });
  });

  it("skips a nameless pipeline", () => {
    expect(
      mapPipeline({ id: 1, name: null }, stages, { isDefault: false, terminalNames: { won: "Won", lost: "Lost" } }),
    ).toEqual({ skipped: true, reason: "pipeline has no name" });
  });
});

describe("deal field mapping", () => {
  it("recognizes hashed custom field keys only", () => {
    expect(isCustomDealField({ id: 1, key: CUSTOM_FIELD_KEY })).toBe(true);
    expect(isCustomDealField({ id: 2, key: "title" })).toBe(false);
    expect(isCustomDealField({ id: 3, key: "not_a_hash" })).toBe(false);
  });

  it("maps field types onto column types and reports the ones with no home", () => {
    expect(mapDealFieldToCustomColumn({ id: 1, key: CUSTOM_FIELD_KEY, name: "Notes", field_type: "text" })).toEqual({
      supported: true,
      label: "Notes",
      type: "plain",
      optionLabels: [],
    });

    expect(
      mapDealFieldToCustomColumn({ id: 2, key: CUSTOM_FIELD_KEY, name: "Budget", field_type: "monetary" }),
    ).toEqual({ supported: true, label: "Budget", type: "currency", optionLabels: [] });

    expect(
      mapDealFieldToCustomColumn({
        id: 3,
        key: CUSTOM_FIELD_KEY,
        name: "Source",
        field_type: "enum",
        options: [{ id: 1, label: "Referral" }],
      }),
    ).toEqual({ supported: true, label: "Source", type: "singleSelect", optionLabels: ["Referral"] });

    expect(mapDealFieldToCustomColumn({ id: 4, key: CUSTOM_FIELD_KEY, name: "Files", field_type: "file" })).toEqual({
      supported: false,
      label: "Files",
      fieldType: "file",
    });
  });

  it("renders option ids as their labels", () => {
    const binding = {
      key: CUSTOM_FIELD_KEY,
      columnId: "col",
      fieldType: "set",
      labelByOptionId: new Map([
        ["1", "Referral"],
        ["2", "Ads"],
      ]),
    };

    expect(formatDealFieldValue("1,2", binding)).toBe("Referral,Ads");
    expect(formatDealFieldValue("9", binding)).toBeNull();
    expect(formatDealFieldValue(null, binding)).toBeNull();
  });

  it("normalizes date field values to the ISO form the date columns store", () => {
    const binding = { key: CUSTOM_FIELD_KEY, columnId: "col", fieldType: "date", labelByOptionId: new Map() };

    expect(formatDealFieldValue("2024-06-30", binding)).toBe("2024-06-30T00:00:00.000Z");
    expect(formatDealFieldValue("nonsense", binding)).toBeNull();
  });
});

describe("deal mapping", () => {
  const context = {
    columns: {
      pipedriveIdColumnId: "col-id",
      valueColumnId: "col-value",
      currencyColumnId: "col-currency",
      closedAtColumnId: "col-closed",
    },
    fieldBindings: [],
    owners,
    organizationIdByPipedriveId: new Map([[11, "organization-1"]]),
    contactIdByPipedriveId: new Map([[5, "contact-1"]]),
    pipelineIdByPipedriveId: new Map([[1, "pipeline-1"]]),
    stageIdByPipedriveId: new Map([[10, "stage-1"]]),
    valueServiceId: "service-1",
  };

  it("maps value, expected close date, relations and the Pipedrive id", () => {
    const mapped = mapDeal(
      {
        id: 100,
        title: "Big deal",
        value: 2500,
        currency: "EUR",
        status: "won",
        probability: 80,
        expected_close_date: "2024-06-30",
        won_time: "2024-06-28 09:00:00",
        pipeline_id: 1,
        stage_id: 10,
        org_id: 11,
        person_id: 5,
        user_id: 1,
      },
      context,
    );

    expect(mapped).toMatchObject({
      skipped: false,
      status: "won",
      warnings: [],
      payload: {
        name: "Big deal",
        pipelineId: "pipeline-1",
        stageId: "stage-1",
        expectedCloseDate: "2024-06-30T00:00:00.000Z",
        probability: 80,
        organizationIds: ["organization-1"],
        contactIds: ["contact-1"],
        userIds: ["user-ada"],
        services: [{ serviceId: "service-1", quantity: 2500 }],
      },
    });

    expect(mapped).toMatchObject({
      skipped: false,
      payload: {
        customFieldValues: [
          { columnId: "col-id", value: "100" },
          { columnId: "col-value", value: "2500" },
          { columnId: "col-currency", value: "EUR" },
          { columnId: "col-closed", value: "2024-06-28T09:00:00.000Z" },
        ],
      },
    });
  });

  it("warns about references that were never imported", () => {
    const mapped = mapDeal(
      { id: 101, title: "Orphan", status: "open", pipeline_id: 9, stage_id: 9, org_id: 9, person_id: 9 },
      context,
    );

    expect(mapped).toMatchObject({
      skipped: false,
      warnings: ["unknown pipeline 9", "unknown stage 9", "unknown organization 9", "unknown person 9"],
    });
  });

  it("refuses to invent a negative deal value", () => {
    const mapped = mapDeal({ id: 102, title: "Refund", status: "open", value: -50 }, context);

    expect(mapped).toMatchObject({
      skipped: false,
      warnings: ["negative deal value is not representable; value left at 0"],
      payload: { services: [] },
    });
  });

  it("skips deleted and untitled deals", () => {
    expect(mapDeal({ id: 103, title: "Gone", status: "deleted" }, context)).toEqual({
      skipped: true,
      reason: "deal is deleted in Pipedrive",
    });
    expect(mapDeal({ id: 104, title: "  ", status: "open" }, context)).toEqual({
      skipped: true,
      reason: "deal has no title",
    });
  });

  it("collects the distinct lost reasons of lost deals only", () => {
    expect(
      distinctLostReasons([
        { id: 1, status: "lost", lost_reason: "Price" },
        { id: 2, status: "lost", lost_reason: "price" },
        { id: 3, status: "lost", lost_reason: "Timing" },
        { id: 4, status: "open", lost_reason: "Ignored" },
        { id: 5, status: "lost", lost_reason: "  " },
      ]),
    ).toEqual(["Price", "Timing"]);
  });
});

describe("status to closing transition", () => {
  const decide = (
    sourceStatus: "open" | "won" | "lost" | "deleted",
    currentStatus: "open" | "won" | "lost",
    hasLostReason = true,
  ) => decideClosingTransition({ sourceStatus, currentStatus, hasLostReason });

  it("does nothing when the target already matches the source", () => {
    expect(decide("open", "open")).toEqual({ action: "none" });
    expect(decide("won", "won")).toEqual({ action: "none" });
    expect(decide("lost", "lost")).toEqual({ action: "none" });
  });

  it("closes a freshly created open deal", () => {
    expect(decide("won", "open")).toEqual({ action: "won" });
    expect(decide("lost", "open")).toEqual({ action: "lost" });
  });

  it("reopens a target that is closed in the wrong direction", () => {
    expect(decide("open", "won")).toEqual({ action: "reopen" });
    expect(decide("open", "lost")).toEqual({ action: "reopen" });
    expect(decide("won", "lost")).toEqual({ action: "reopenThenWin" });
    expect(decide("lost", "won")).toEqual({ action: "reopenThenLose" });
  });

  it("refuses to lose a deal that has no mapped lost reason", () => {
    expect(decide("lost", "open", false)).toEqual({ action: "skip", reason: "lost deal has no lost reason to map" });
  });

  it("skips deals Pipedrive deleted", () => {
    expect(decide("deleted", "open")).toEqual({ action: "skip", reason: "deal is deleted in Pipedrive" });
  });
});

describe("stage history replay", () => {
  const flow = [
    { object: "dealChange", data: { field_key: "stage_id", new_value: 30, log_time: "2024-03-03 10:00:00" } },
    { object: "dealChange", data: { field_key: "stage_id", new_value: 10, log_time: "2024-03-01 10:00:00" } },
    { object: "dealChange", data: { field_key: "title", new_value: "x", log_time: "2024-03-02 10:00:00" } },
    { object: "dealChange", data: { field_key: "stage_id", new_value: 20, log_time: "2024-03-02 10:00:00" } },
  ];

  it("keeps only stage changes, oldest first", () => {
    expect(orderStageChanges(flow).map((change) => change.stageId)).toEqual([10, 20, 30]);
  });

  it("ignores entries with no usable timestamp or stage", () => {
    expect(orderStageChanges([{ object: "dealChange", data: { field_key: "stage_id", new_value: 1 } }])).toEqual([]);
    expect(orderStageChanges([{ object: "dealChange" }])).toEqual([]);
  });

  it("translates the ordered changes into target stage ids and drops repeats", () => {
    const index = new Map([
      [10, "stage-a"],
      [20, "stage-b"],
      [30, "stage-c"],
    ]);

    expect(stageReplayPlan(orderStageChanges(flow), index, "stage-c")).toEqual(["stage-a", "stage-b", "stage-c"]);
  });

  it("drops changes into stages that were never imported", () => {
    expect(stageReplayPlan(orderStageChanges(flow), new Map([[20, "stage-b"]]), undefined)).toEqual(["stage-b"]);
  });
});

describe("activity and note mapping", () => {
  const activityContext = {
    pipedriveIdColumnId: "col-id",
    owners,
    dealIdByPipedriveId: new Map([[100, "deal-1"]]),
    contactIdByPipedriveId: new Map([[5, "contact-1"]]),
    organizationIdByPipedriveId: new Map([[11, "organization-1"]]),
  };

  it("maps a default activity type, its due date and its duration onto the task", () => {
    const mapped = mapActivity(
      {
        id: 200,
        subject: "Call Ada",
        type: "call",
        due_date: "2024-04-01",
        due_time: "09:30",
        duration: "00:45",
        done: true,
        note: "<p>Discuss <b>pricing</b></p>",
        deal_id: 100,
        person_id: 5,
        org_id: 11,
        user_id: 1,
      },
      activityContext,
    );

    expect(mapped).toMatchObject({
      skipped: false,
      unmappedActivityType: null,
      completed: true,
      payload: {
        name: "Call Ada",
        activityKind: "call",
        dueAt: "2024-04-01T09:30:00.000Z",
        durationMinutes: 45,
        dealIds: ["deal-1"],
        contactIds: ["contact-1"],
        organizationIds: ["organization-1"],
        userIds: ["user-ada"],
        customFieldValues: [{ columnId: "col-id", value: "200" }],
      },
    });

    expect(mapped.skipped === false && mapped.payload.notes).not.toContain("Pipedrive activity type");
    expect(mapped.skipped === false && mapped.payload.notes).not.toContain("Due:");
    expect(mapped.skipped === false && mapped.payload.notes).toContain("Completed in Pipedrive: yes");
    expect(mapped.skipped === false && mapped.payload.notes).toContain("Discuss pricing");
  });

  it("keeps a customised activity type in the notes and reports it", () => {
    const mapped = mapActivity({ id: 203, subject: "Site visit", type: "site_visit" }, activityContext);

    expect(mapped).toMatchObject({ skipped: false, unmappedActivityType: "site_visit", completed: false });
    expect(mapped.skipped === false && mapped.payload.activityKind).toBeUndefined();
    expect(mapped.skipped === false && mapped.payload.notes).toContain("Pipedrive activity type: site_visit");
  });

  it("reads a due date with no due time as midnight UTC", () => {
    expect(parseActivityDueAt({ id: 204, due_date: "2024-04-01" })?.toISOString()).toBe("2024-04-01T00:00:00.000Z");
    expect(parseActivityDueAt({ id: 205, due_time: "09:30" })).toBeNull();
  });

  it("reads HH:MM durations as whole minutes and rejects the ones Task cannot hold", () => {
    expect(parseActivityDurationMinutes("01:30")).toBe(90);
    expect(parseActivityDurationMinutes("00:45:00")).toBe(45);
    expect(parseActivityDurationMinutes("00:00")).toBeNull();
    expect(parseActivityDurationMinutes(null)).toBeNull();
  });

  it("maps each of the six default Pipedrive activity types", () => {
    for (const type of ["call", "meeting", "email", "task", "deadline", "lunch"])
      expect(mapActivityKind(type)).toBe(type);

    expect(mapActivityKind("site_visit")).toBeNull();
    expect(mapActivityKind(null)).toBeNull();
  });

  it("falls back to the activity type when there is no subject", () => {
    expect(mapActivity({ id: 201, subject: "  ", type: "email" }, activityContext)).toMatchObject({
      skipped: false,
      payload: { name: "email" },
    });
  });

  it("skips an activity with neither subject nor type", () => {
    expect(mapActivity({ id: 202 }, activityContext)).toEqual({ skipped: true, reason: "activity has no subject" });
  });

  it("attaches a note to the most specific record it references", () => {
    expect(noteOwner({ id: 1, deal_id: 100, person_id: 5, org_id: 11 })).toEqual({ entity: "deal", pipedriveId: 100 });
    expect(noteOwner({ id: 2, person_id: 5, org_id: 11 })).toEqual({ entity: "contact", pipedriveId: 5 });
    expect(noteOwner({ id: 3, org_id: 11 })).toEqual({ entity: "organization", pipedriveId: 11 });
    expect(noteOwner({ id: 4 })).toBeNull();
  });

  it("renders a note as an attributed markdown block", () => {
    const markdown = mapNoteToMarkdown(
      { id: 300, content: "<p>Signed the <i>contract</i></p>", add_time: "2024-05-06 08:00:00" },
      "Ada Lovelace",
    );

    expect(markdown).toBe("**Pipedrive note 300 — 2024-05-06 — Ada Lovelace**\n\nSigned the contract");
  });

  it("round-trips the imported note id bookkeeping", () => {
    expect(parseImportedNoteIds("3, 1 ,2")).toEqual(new Set(["3", "1", "2"]));
    expect(parseImportedNoteIds(null)).toEqual(new Set());
    expect(serializeImportedNoteIds(["2", "1", "2"])).toBe("1,2");
  });
});
