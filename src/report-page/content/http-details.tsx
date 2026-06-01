/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { type HttpMessage } from "@/common/models/http-message.ts";
import {
  buildHttpMessageDetails,
  type HttpRequestDetails,
  type HttpResponseDetails,
} from "./content-builders.ts";

export type HttpDetailsProps = {
  httpMessage: HttpMessage;
  sequenceNumber: number;
};

export function HttpDetails({ httpMessage, sequenceNumber }: HttpDetailsProps) {
  const httpMessageDetails = buildHttpMessageDetails(httpMessage);

  return (
    <section className="rounded-lg border border-gray-700 bg-gray-950 p-6">
      <h2 className="mb-6 text-3xl font-bold">
        {`${sequenceNumber}\uFE0F\u20E3`}{" "}
        {httpMessageDetails.kind === "request" ? "HTTP Request" : "HTTP Response"}
      </h2>

      {/* Request/Response Line Section */}
      <section className="mb-6">
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          {httpMessageDetails.kind === "request"
            ? HttpRequestLine(httpMessageDetails)
            : HttpResponseLine(httpMessageDetails)}
        </div>
      </section>

      {/* Headers Section */}
      <section className="mb-6">
        <h3 className="mb-2 text-lg font-semibold text-cyan-400">Headers</h3>
        <div className="overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
          <table className="w-full border-collapse">
            <tbody>
              {httpMessageDetails.headers.map((header, index) => (
                <tr
                  key={index}
                  className={`even:bg-gray-800/80 ${
                    index < httpMessageDetails.headers.length - 1 ? "border-b border-gray-800" : ""
                  }`}
                >
                  <td className="w-1/4 px-4 py-3 font-semibold text-gray-300">{header.name}</td>
                  <td className="px-4 py-3 font-mono wrap-anywhere">{header.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Body Section */}
      <section>
        <h3 className="mb-2 text-lg font-semibold text-cyan-400">Body</h3>
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <pre className="font-mono text-sm wrap-anywhere whitespace-pre-wrap">
            {httpMessageDetails.body}
          </pre>
        </div>
      </section>
    </section>
  );
}

function HttpRequestLine(httpRequestDetails: HttpRequestDetails) {
  return (
    <div className="flex items-center gap-3">
      <span className="rounded bg-blue-600 px-3 py-1 font-mono text-lg font-bold text-white">
        {httpRequestDetails.method}
      </span>
      <span className="font-mono text-lg wrap-anywhere">{httpRequestDetails.url}</span>
    </div>
  );
}

function HttpResponseLine(httpResponseDetails: HttpResponseDetails) {
  return (
    <div className="flex justify-between gap-8">
      {/* Status Line */}
      <div className="flex items-center gap-3">
        <span className="rounded bg-green-600 px-3 py-1 font-mono text-lg font-bold text-white">
          {httpResponseDetails.statusCode}
        </span>
        <span className="font-mono text-lg">{httpResponseDetails.statusText}</span>
      </div>
      {/* Request Info */}
      <div className="flex items-center gap-3">
        <span className="text-sm whitespace-nowrap text-gray-400">Response to:</span>
        <span className="rounded bg-blue-600 px-2 py-0.5 font-mono text-sm font-bold text-white">
          {httpResponseDetails.requestMethod}
        </span>
        <span className="font-mono text-sm wrap-anywhere text-gray-300">
          {httpResponseDetails.requestUrl}
        </span>
      </div>
    </div>
  );
}
