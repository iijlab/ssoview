/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type SessionSummary } from "@/common/models/session-summary.ts";
import { buildSessionData, buildSessionResult } from "./content-builders.ts";

type SessionOverviewProps = {
  sessionSummary: SessionSummary;
  authnRequestXml?: string;
  responseXml?: string;
};

export function SessionOverview({
  sessionSummary,
  authnRequestXml,
  responseXml,
}: SessionOverviewProps) {
  const sessionData = buildSessionData(sessionSummary, authnRequestXml, responseXml);
  const sessionResult = buildSessionResult(sessionSummary, authnRequestXml, responseXml);

  const statusBadgeColor =
    sessionResult.status === "Success"
      ? "bg-green-600"
      : sessionResult.status === "Unknown"
        ? "bg-gray-600"
        : "bg-red-600";

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-950 p-6">
      <h2 className="mb-6 text-3xl font-bold">Single Sign-On Session Summary</h2>

      <section className="mb-6">
        <h3 className="mb-4 text-2xl font-bold">Session Result</h3>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center gap-3">
            <span className={`rounded px-3 py-1 font-bold text-white ${statusBadgeColor}`}>
              {sessionResult.status}
            </span>
            <span className="text-sm text-gray-400">{sessionResult.description}</span>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-4 text-2xl font-bold">Session Information</h3>
        <div className="overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
          <table className="w-full border-collapse">
            <tbody>
              <tr className="border-b border-gray-800 even:bg-gray-800/80">
                <td className="w-1/3 px-4 py-3 font-semibold text-gray-300">Session ID</td>
                <td className="px-4 py-3">{sessionData.sessionId}</td>
              </tr>
              <tr className="border-b border-gray-800 even:bg-gray-800/80">
                <td className="w-1/3 px-4 py-3 font-semibold text-gray-300">Session Start Time</td>
                <td className="px-4 py-3">{sessionData.sessionStartTime}</td>
              </tr>
              <tr className="border-b border-gray-800 even:bg-gray-800/80">
                <td className="w-1/3 px-4 py-3 font-semibold text-gray-300">Session End Time</td>
                <td className="px-4 py-3">{sessionData.sessionEndTime}</td>
              </tr>
              <tr className="border-b border-gray-800 even:bg-gray-800/80">
                <td className="w-1/3 px-4 py-3 font-semibold text-gray-300">Service Provider</td>
                <td className="px-4 py-3">{sessionData.serviceProvider}</td>
              </tr>
              <tr className="border-b border-gray-800 even:bg-gray-800/80">
                <td className="w-1/3 px-4 py-3 font-semibold text-gray-300">Identity Provider</td>
                <td className="px-4 py-3">{sessionData.identityProvider}</td>
              </tr>
              <tr className="border-b border-gray-800 even:bg-gray-800/80">
                <td className="w-1/3 px-4 py-3 font-semibold text-gray-300">SAML Version</td>
                <td className="px-4 py-3">{sessionData.samlVersion}</td>
              </tr>
              <tr className="border-b border-gray-800 even:bg-gray-800/80">
                <td className="w-1/3 px-4 py-3 font-semibold text-gray-300">SAML Profile</td>
                <td className="px-4 py-3">{sessionData.samlProfile}</td>
              </tr>
              <tr className="border-b border-gray-800 even:bg-gray-800/80">
                <td className="w-1/3 px-4 py-3 font-semibold text-gray-300">Protocol Binding</td>
                <td className="px-4 py-3">{sessionData.protocolBinding}</td>
              </tr>
              <tr className="border-b border-gray-800 even:bg-gray-800/80">
                <td className="w-1/3 px-4 py-3 font-semibold text-gray-300">User ID</td>
                <td className="px-4 py-3">{sessionData.userId}</td>
              </tr>
              <tr className="even:bg-gray-800/80">
                <td className="w-1/3 px-4 py-3 font-semibold text-gray-300">
                  Authentication Method
                </td>
                <td className="px-4 py-3">{sessionData.authenticationMethod}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
