import type { ChipColor } from "@/constants/chip-colors";
import type { WebFormSubmissionStatus } from "./web-form-submission.schema";

export const WEB_FORM_SUBMISSION_STATUS_CHIP_COLOR: Record<WebFormSubmissionStatus, ChipColor> = {
  received: "info",
  processed: "success",
  failed: "destructive",
};
