/**
 * Call outcomes (P4 CALL CENTER; operations.md OPE-§6.1, §6.1a). Frozen at P0 as the two outcome vocabularies the
 * frozen `TransitionInput.attempt` carries (src/lib/orders/transition.ts); P4 adds `recordOutcome` and the outcome
 * input here, never a new meaning for these names.
 */

/** the confirmation lane's outcomes (OPE-§6.1) */
export type AttemptOutcome = "confirmed" | "no_answer" | "busy" | "switched_off" | "wrong_number" | "callback" | "cancelled" | "fake" | "duplicate";
/** rev 3 (OD48): the delivery lane's outcomes (OPE-§6.1a) */
export type DeliveryOutcome = "customer_informed" | "reschedule" | "no_answer" | "busy" | "cancel_recall";
