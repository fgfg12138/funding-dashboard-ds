/**
 * Testnet Secret Access Policy — Phase 5.18 Policy Only
 *
 * Determines whether the server is allowed to attempt Secret access
 * for a testnet route. Does NOT read, decrypt, or sign with any Secret.
 *
 * All checks must pass before Secret access can be considered.
 * In Phase 5.18, even with all checks passing, the policy returns
 * allowedToRequestSecret=false.
 */

import type {
  TestnetSecretAccessPolicyInput,
  TestnetSecretAccessPolicyResult,
} from "./testnetSecretPolicyTypes";

/**
 * Evaluate the secret access policy for a testnet route request.
 *
 * Rules:
 * 1. envValidation.valid !== true → blocked
 * 2. envConfig.exchangeEnv !== "testnet" → blocked
 * 3. envConfig.testnetRoutesEnabled !== true → blocked
 * 4. envConfig.testnetOrderSubmitEnabled === true → blocked (current phase)
 * 5. guardResult.allowed !== true → blocked
 * 6. All pass → still blocked by PHASE_5_18_SECRET_ACCESS_BLOCKED
 *
 * @param input - The policy input with env config, guard result, etc.
 * @returns The policy result with allowed flag and reason codes.
 */
export function evaluateTestnetSecretAccessPolicy(
  input: TestnetSecretAccessPolicyInput,
): TestnetSecretAccessPolicyResult {
  const { envConfig, envValidation, guardResult, routeName } = input;

  const blocks: { reasonCode: string; message: string }[] = [];

  // Rule 1: env validation must pass
  if (!envValidation.valid) {
    blocks.push({
      reasonCode: "ENV_VALIDATION_FAILED",
      message: "Environment validation failed — check EXCHANGE_ENV and safety flags",
    });
  }

  // Rule 2: exchangeEnv must be "testnet"
  if (envConfig.exchangeEnv !== "testnet") {
    blocks.push({
      reasonCode: "EXCHANGE_ENV_NOT_TESTNET",
      message: `exchangeEnv is "${envConfig.exchangeEnv}" — must be "testnet" for Secret access`,
    });
  }

  // Rule 3: testnet routes must be enabled
  if (!envConfig.testnetRoutesEnabled) {
    blocks.push({
      reasonCode: "TESTNET_ROUTES_DISABLED",
      message: "TESTNET_ROUTES_ENABLED is false — testnet routes not accessible",
    });
  }

  // Rule 4: order submit must NOT be enabled (Phase 5.18 safety)
  if (envConfig.testnetOrderSubmitEnabled) {
    blocks.push({
      reasonCode: "ORDER_SUBMIT_ENABLED_IN_PHASE_5_18",
      message: "TESTNET_ORDER_SUBMIT_ENABLED must be false in Phase 5.18",
    });
  }

  // Rule 5: guard must allow
  if (!guardResult.allowed) {
    blocks.push({
      reasonCode: "GUARD_REJECTED",
      message: "Security guard rejected the request",
    });
  }

  if (blocks.length > 0) {
    return {
      allowedToRequestSecret: false,
      severity: "blocked",
      reasonCodes: blocks.map((b) => b.reasonCode),
      messages: blocks.map((b) => b.message),
      source: "testnet-secret-policy-skeleton",
    };
  }

  // All checks pass — but Phase 5.18 still blocks Secret access
  return {
    allowedToRequestSecret: false,
    severity: "info",
    reasonCodes: ["PHASE_5_18_SECRET_ACCESS_BLOCKED"],
    messages: ["All policy checks passed — Secret access blocked by Phase 5.18 skeleton policy"],
    source: "testnet-secret-policy-skeleton",
  };
}
