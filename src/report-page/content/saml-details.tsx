/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { buildAuthnRequestDetails, buildResponseDetails } from "./content-builders.ts";

export type SamlDetailsProps = {
  kind: "request" | "response";
  rawXml: string;
};

export function SamlDetails({ kind, rawXml }: SamlDetailsProps) {
  const samlMessageDetails =
    kind === "request" ? buildAuthnRequestDetails(rawXml) : buildResponseDetails(rawXml);
  if (!samlMessageDetails) {
    console.warn("Invalid SAML XML", { kind, rawXml });
    return null;
  }

  return (
    <section className="rounded-lg border border-gray-700 bg-gray-950 p-6">
      <h2 className="mb-6 text-3xl font-bold">
        {kind === "request" ? "SAML AuthnRequest" : "SAML Response"}
      </h2>

      {samlMessageDetails.sections.map((section, sectionIndex) => (
        <section key={sectionIndex} className="mb-6">
          {sectionIndex > 0 && (
            <h3 className="mb-2 text-lg font-semibold text-cyan-400">{section.title}</h3>
          )}
          <div className="overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
            <table className="w-full border-collapse">
              <tbody>
                {section.fields.map((field, fieldIndex) => (
                  <tr
                    key={fieldIndex}
                    className={`even:bg-gray-800/80 ${
                      fieldIndex < section.fields.length - 1 ? "border-b border-gray-800" : ""
                    }`}
                  >
                    <td className="w-1/4 px-4 py-3 font-semibold text-gray-300">{field.name}</td>
                    <td className="w-1/2 px-4 py-3 font-mono wrap-anywhere">{field.value}</td>
                    <td className="w-1/4 px-4 py-3 text-sm text-gray-400">{field.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {/* XML Section */}
      <section>
        <h3 className="mb-4 text-2xl font-bold">XML</h3>
        <div className="overflow-auto rounded-lg border border-gray-800 bg-gray-900 p-4">
          <pre className="text-sm">
            <code>{formatXml(samlMessageDetails.rawXml)}</code>
          </pre>
        </div>
      </section>
    </section>
  );
}

function formatXml(xml: string): string {
  let formatted = "";
  let indent = "";
  const tab = "  ";
  xml.split(/>\s*</).forEach((node) => {
    if (node.match(/^\/\w/)) {
      indent = indent.substring(tab.length);
    }
    formatted += indent + "<" + node + ">\r\n";
    if (node.match(/^<?\w[^>]*[^/]$/) && !node.startsWith("?")) {
      indent += tab;
    }
  });
  return formatted.substring(1, formatted.length - 3);
}
