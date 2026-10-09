import { z } from "zod";

export const MAX_ACTIVITY_DURATION_MINUTES = 1440;

export const ActivityDurationSchema = z.number().int().min(1).max(MAX_ACTIVITY_DURATION_MINUTES);
