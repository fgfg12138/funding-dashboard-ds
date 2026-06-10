/**
 * Tester Feedback Types — Local Tester Feedback Loop
 *
 * Pure types for structured tester feedback — no API calls, no upload.
 */

export type TesterFeedbackIssueType =
  | "UI看不懂"
  | "数据不刷新"
  | "页面报错"
  | "数字异常"
  | "安全状态不清楚"
  | "导航找不到"
  | "其他";

export type TesterFeedbackSeverity = "低" | "中" | "高" | "严重";

export type TesterFeedback = {
  /** The page the tester was on. */
  page: string;
  /** Type of issue. */
  issueType: TesterFeedbackIssueType;
  /** Severity level. */
  severity: TesterFeedbackSeverity;
  /** Description of the issue. */
  description: string;
  /** Steps to reproduce. */
  stepsToReproduce: string;
  /** What the tester expected to happen. */
  expectedResult: string;
  /** What actually happened. */
  actualResult: string;
  /** Whether a screenshot is suggested. */
  screenshotSuggested: boolean;
  /** Browser / device info. */
  browser: string;
  /** Timestamp (ms) when the feedback was created. */
  createdAt: number;
};
