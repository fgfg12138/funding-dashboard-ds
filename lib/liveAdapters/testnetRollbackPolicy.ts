/**
 * Testnet Rollback Policy — Phase 6.5 Design Only
 *
 * Evaluates whether the server is allowed to execute rollback
 * actions for a testnet order. Does NOT cancel, submit, or
 * call any exchange API.
 *
 * Rules:
 * 1. environment !== "testnet" → blocked
 * 2. auditPersistenceReady !== true → blocked
 * 3. operatorConfirmed !== true → blocked
 * 4. killSwitchEnabled === true → severity warning/block depending on status
 * 5. orderStatus unknown/partial/submitted → actions include cancel-order-planned
 * 6. orderStatus filled → actions include reconciliation-required
 * 7. All pass → still blocked (PHASE_6_5_ROLLBACK_DISABLED)
 */

import type {
  TestnetRollbackPolicyInput,
  TestnetRollbackPolicyResult,
  TestnetRollbackAction,
  TestnetRollbackOrderStatus,
} from "./testnetRollbackTypes";

/**
 * Evaluate the rollback policy for a testnet order.
 *
 * @param input - Policy input with order status and safety flags.
 * @returns Policy result with rollback flag and planned actions.
 */
export function evaluateTestnetRollbackPolicy(
  input: TestnetRollbackPolicyInput,
): TestnetRollbackPolicyResult {
  const { environment, auditPersistenceReady, operatorConfirmed, killSwitchEnabled, orderStatus } = input;

  const blocks: { reasonCode: string; message: string }[] = [];
  const actions: TestnetRollbackAction[] = [];

  // Rule 1
  if (environment !== "testnet") {
    blocks.push({ reasonCode: "ENVIRONMENT_NOT_TESTNET", message: `Environment is "${environment}" — must be "testnet"` });
  }

  // Rule 2
  if (!auditPersistenceReady) {
    blocks.push({ reasonCode: "AUDIT_PERSISTENCE_NOT_READY", message: "Audit persistence not ready — rollback requires persistent audit" });
  }

  // Rule 3
  if (!operatorConfirmed) {
    blocks.push({ reasonCode: "OPERATOR_NOT_CONFIRMED", message: "Operator has not confirmed rollback — manual confirmation required" });
  }

  // Rule 4: Kill Switch interaction
  if (killSwitchEnabled) {
    actions.push("freeze-further-submissions");
    actions.push("notify-operator");
    if (orderStatus === "unknown" || orderStatus === "submitted" || orderStatus === "partial") {
      actions.push("cancel-order-planned");
    }
    if (orderStatus === "filled" || orderStatus === "partial") {
      actions.push("reconciliation-required");
    }
    blocks.push({ reasonCode: "KILL_SWITCH_ENABLED", message: "Kill Switch is enabled — emergency rollback actions planned" });
  }

  // Rule 5: unknown/partial/submitted → cancel-order-planned
  if (orderStatus === "unknown" || orderStatus === "submitted" || orderStatus === "partial") {
    if (!actions.includes("cancel-order-planned")) {
      actions.push("cancel-order-planned");
    }
  }

  // Rule 6: filled/partial → reconciliation-required
  if (orderStatus === "filled" || orderStatus === "partial") {
    if (!actions.includes("reconciliation-required")) {
      actions.push("reconciliation-required");
    }
  }

  // Always add notify for non-trivial statuses
  if (orderStatus === "unknown" || orderStatus === "partial") {
    if (!actions.includes("notify-operator")) {
      actions.push("notify-operator");
    }
  }

  if (blocks.length > 0) {
    return {
      allowedToRollback: false,
      severity: killSwitchEnabled ? "warning" : "blocked",
      reasonCodes: blocks.map((b) => b.reasonCode),
      actions,
      messages: blocks.map((b) => b.message),
      source: "testnet-rollback-plan-design",
    };
  }

  // Rule 7: Phase 6.5 still blocks
  return {
    allowedToRollback: false,
    severity: "info",
    reasonCodes: ["PHASE_6_5_ROLLBACK_DISABLED"],
    actions,
    messages: ["All rollback policy checks passed — rollback disabled by Phase 6.5 design"],
    source: "testnet-rollback-plan-design",
  };
}
