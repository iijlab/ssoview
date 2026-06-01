/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import type Protocol from "devtools-protocol";
import { type HttpMessage } from "@/common/models/http-message.ts";
import { type SessionSummary } from "@/common/models/session-summary.ts";
import { parseSamlpAuthnRequest, parseSamlpResponse } from "@/common/services/saml-parser.ts";
import { getHttpStatusText } from "@/report-page/common/utils.ts";

//
// SessionOverview
//

type SessionData = {
  sessionId: string;
  sessionStartTime: string;
  sessionEndTime: string;
  serviceProvider: string;
  identityProvider: string;
  samlVersion: string;
  samlProfile: string;
  protocolBinding: string;
  userId: string;
  authenticationMethod: string;
};

export function buildSessionData(
  sessionSummary: SessionSummary,
  authnRequestXml?: string,
  responseXml?: string,
): SessionData {
  const authnRequest = authnRequestXml ? parseSamlpAuthnRequest(authnRequestXml) : undefined;
  const response = responseXml ? parseSamlpResponse(responseXml) : undefined;

  // Extract fields (fall back to "N/A" if error or undefined)
  const samlVersion =
    authnRequest && !(authnRequest instanceof Error) && !(authnRequest.$version instanceof Error)
      ? authnRequest.$version
      : "N/A";

  const protocolBinding =
    authnRequest &&
    !(authnRequest instanceof Error) &&
    authnRequest.$protocolBinding &&
    !(authnRequest.$protocolBinding instanceof Error)
      ? authnRequest.$protocolBinding
      : "N/A";

  const userId = (() => {
    if (!response || response instanceof Error) return "N/A";
    const assertions = response.assertions;
    if (!assertions || assertions instanceof Error) return "N/A";
    const assertion = assertions[0];
    if (!assertion || assertion instanceof Error) return "N/A";
    const subject = assertion.subject;
    if (!subject || subject instanceof Error) return "N/A";
    const nameId = subject.nameId;
    if (!nameId || nameId instanceof Error) return "N/A";
    if (nameId.$$content instanceof Error) return "N/A";
    return nameId.$$content;
  })();

  const authenticationMethod = (() => {
    if (!response || response instanceof Error) return "N/A";
    const assertions = response.assertions;
    if (!assertions || assertions instanceof Error) return "N/A";
    const assertion = assertions[0];
    if (!assertion || assertion instanceof Error) return "N/A";
    const authnStatements = assertion.authnStatements;
    if (!authnStatements || authnStatements instanceof Error) return "N/A";
    const authnStatement = authnStatements[0];
    if (!authnStatement || authnStatement instanceof Error) return "N/A";
    const authnContext = authnStatement.authnContext;
    if (!authnContext || authnContext instanceof Error) return "N/A";
    const classRef = authnContext.authnContextClassRef;
    if (!classRef || classRef instanceof Error) return "N/A";
    if (classRef.$$content instanceof Error) return "N/A";
    return classRef.$$content;
  })();

  return {
    sessionId: sessionSummary.sessionId,
    sessionStartTime: sessionSummary.start ?? "N/A",
    sessionEndTime: sessionSummary.end ?? "N/A",
    serviceProvider: sessionSummary.sp ?? "N/A",
    identityProvider: sessionSummary.idp ?? "N/A",
    samlVersion,
    samlProfile: "Web Browser SSO Profile",
    protocolBinding,
    userId,
    authenticationMethod,
  };
}

type SessionResult = {
  status: string;
  description: string;
};

export function buildSessionResult(
  _sessionSummary: SessionSummary,
  _authnRequestXml?: string,
  responseXml?: string,
): SessionResult {
  if (!responseXml) {
    return {
      status: "Unknown",
      description: "SAML Response was not captured.",
    };
  }

  const parsed = parseSamlpResponse(responseXml);
  if (parsed instanceof Error) {
    return {
      status: "Unknown",
      description: "Failed to parse SAML Response XML.",
    };
  }

  const status = unwrap(parsed.status);
  const statusCode = unwrap(status?.statusCode);
  const value = unwrap(statusCode?.$value);
  if (!value) {
    return {
      status: "Unknown",
      description: "StatusCode value not found in SAML Response.",
    };
  }
  const shortStatusCode = value.split(":").pop()!;

  const subStatusCode = statusCode?.statusCode;
  const subValue = unwrap(subStatusCode?.$value);
  const subShortStatusCode = subValue?.split(":").pop();

  return subShortStatusCode
    ? {
        status: `${shortStatusCode}:${subShortStatusCode}`,
        description: `${describeStatusCode(shortStatusCode)} ${describeStatusCode(subShortStatusCode)}`,
      }
    : {
        status: shortStatusCode,
        description: describeStatusCode(shortStatusCode),
      };
}

function describeStatusCode(shortStatusCode: string): string {
  // from SAML Core 2.0, Section 3.2.2.2
  const descriptions: Record<string, string> = {
    // top-level status codes
    Success:
      "AuthnRequest processed successfully. The Identity Provider returned a Response containing a valid SAML Assertion.",
    Requester: "The request could not be performed due to an error on the part of the requester.",
    Responder:
      "The request could not be performed due to an error on the part of the SAML responder or SAML authority.",
    VersionMismatch:
      "The SAML responder could not process the request because the version of the request message was incorrect.",

    // second-level status codes
    AuthnFailed: "The responding provider was unable to successfully authenticate the principal.",
    InvalidAttrNameOrValue:
      "Unexpected or invalid content was encountered within an Attribute or AttributeValue element.",
    InvalidNameIDPolicy:
      "The responding provider cannot or will not support the requested name identifier policy.",
    NoAuthnContext:
      "The specified authentication context requirements cannot be met by the responder.",
    NoAvailableIDP:
      "Used by an intermediary to indicate that none of the supported identity provider Loc elements in an IDPList can be resolved or that none of the supported identity providers are available.",
    NoPassive:
      "The responding provider cannot authenticate the principal passively, as has been requested.",
    NoSupportedIDP:
      "None of the identity providers in the IDPList are supported by the intermediary.",
    PartialLogout:
      "The session authority was not able to propagate logout to all other session participants.",
    ProxyCountExceeded:
      "The responding provider cannot authenticate the principal directly and is not permitted to proxy the request further.",
    RequestDenied:
      "The SAML responder or SAML authority is able to process the request but has chosen not to respond.",
    RequestUnsupported: "The SAML responder or SAML authority does not support the request.",
    RequestVersionDeprecated:
      "The SAML responder cannot process any requests with the protocol version specified in the request.",
    RequestVersionTooHigh:
      "The SAML responder cannot process the request because the protocol version specified in the request message is a major upgrade from the highest protocol version supported by the responder.",
    RequestVersionTooLow: "The protocol version specified in the request message is too low.",
    ResourceNotRecognized:
      "The resource value provided in the request message is invalid or unrecognized.",
    TooManyResponses:
      "The response message would contain more elements than the SAML responder is able to return.",
    UnknownAttrProfile:
      "An entity that has no knowledge of a particular attribute profile has been presented with an attribute drawn from that profile.",
    UnknownPrincipal:
      "The responding provider does not recognize the principal specified or implied by the request.",
    UnsupportedBinding:
      "The SAML responder cannot properly fulfill the request using the protocol binding specified in the request.",
  };

  return descriptions[shortStatusCode] ?? "";
}

//
// SamlDetails
//

type SamlMessageDetails = {
  sections: SamlMessageSection[];
  rawXml: string;
};

type SamlMessageSection = {
  title: string;
  fields: SamlMessageField[];
};

type SamlMessageField = {
  name: string;
  value: string;
  description: string;
};

export function buildAuthnRequestDetails(rawXml: string): SamlMessageDetails | undefined {
  const parsed = parseSamlpAuthnRequest(rawXml);
  if (parsed instanceof Error) {
    return undefined;
  }

  const conditions = unwrap(parsed.conditions);
  const audienceRestrictions = unwrap(conditions?.audienceRestrictions);
  const audiences = unwrap(audienceRestrictions?.[0]?.audiences);

  const sections: SamlMessageSection[] = [
    {
      title: "AuthnRequest",
      fields: [
        {
          name: "ID",
          value: unwrap(parsed.$id) ?? "",
          description: "Unique identifier for this request",
        },
        {
          name: "Version",
          value: unwrap(parsed.$version) ?? "",
          description: "SAML protocol version",
        },
        {
          name: "IssueInstant",
          value: unwrap(parsed.$issueInstant) ?? "",
          description: "Time when the request was issued",
        },
        {
          name: "ForceAuthn",
          value: unwrap(parsed.$forceAuthn) ?? "",
          description: "Whether re-authentication is required",
        },
        {
          name: "IsPassive",
          value: unwrap(parsed.$isPassive) ?? "",
          description: "Whether the IdP must not interact with the user",
        },
        {
          name: "ProtocolBinding",
          value: unwrap(parsed.$protocolBinding) ?? "",
          description: "Protocol binding for the response",
        },
        {
          name: "Destination",
          value: unwrap(parsed.$destination) ?? "",
          description: "IdP endpoint URL",
        },
        {
          name: "AssertionConsumerServiceURL",
          value: unwrap(parsed.$assertionConsumerServiceUrl) ?? "",
          description: "URL where the response should be sent",
        },
        {
          name: "ProviderName",
          value: unwrap(parsed.$providerName) ?? "",
          description: "Human-readable name of the SP",
        },
      ].filter((f) => f.value !== ""),
    },
    {
      title: "Issuer",
      fields: [
        {
          name: "Issuer",
          value: unwrap(unwrap(parsed.issuer)?.$$content) ?? "",
          description: "SP entity ID",
        },
      ].filter((f) => f.value !== ""),
    },
    {
      title: "NameIDPolicy",
      fields: [
        {
          name: "Format",
          value: unwrap(unwrap(parsed.nameIdPolicy)?.$format) ?? "",
          description: "Requested name identifier format",
        },
        {
          name: "AllowCreate",
          value: unwrap(unwrap(parsed.nameIdPolicy)?.$allowCreate) ?? "",
          description: "Whether the IdP may create a new identifier",
        },
      ].filter((f) => f.value !== ""),
    },
    {
      title: "Conditions",
      fields: [
        {
          name: "NotBefore",
          value: unwrap(conditions?.$notBefore) ?? "",
          description: "Validity start",
        },
        {
          name: "NotOnOrAfter",
          value: unwrap(conditions?.$notOnOrAfter) ?? "",
          description: "Validity end",
        },
        ...(audiences?.map((a) => ({
          name: "Audience",
          value: unwrap(a?.$$content) ?? "",
          description: "Intended audience",
        })) ?? []),
      ].filter((f) => f.value !== ""),
    },
  ].filter((s) => 0 < s.fields.length);

  return { sections, rawXml };
}

export function buildResponseDetails(rawXml: string): SamlMessageDetails | undefined {
  const parsed = parseSamlpResponse(rawXml);
  if (parsed instanceof Error) {
    return undefined;
  }

  const assertions = unwrap(parsed.assertions);
  const assertion = assertions?.[0];
  const subject = unwrap(assertion?.subject);
  const nameId = unwrap(subject?.nameId);
  const subjectConfirmations = unwrap(subject?.subjectConfirmations);
  const subjectConfirmation = subjectConfirmations?.[0];
  const subjectConfirmationData = unwrap(subjectConfirmation?.subjectConfirmationData);
  const responseSignature = unwrap(parsed.signature);
  const responseSignedInfo = unwrap(responseSignature?.signedInfo);
  const responseReference = unwrap(responseSignedInfo?.reference);
  const responseTransforms = unwrap(responseReference?.transforms);
  const responseKeyInfo = unwrap(responseSignature?.keyInfo);
  const responseX509Data = unwrap(responseKeyInfo?.x509Data);
  const assertionSignature = unwrap(assertion?.signature);
  const assertionSignedInfo = unwrap(assertionSignature?.signedInfo);
  const assertionReference = unwrap(assertionSignedInfo?.reference);
  const assertionTransforms = unwrap(assertionReference?.transforms);
  const assertionKeyInfo = unwrap(assertionSignature?.keyInfo);
  const assertionX509Data = unwrap(assertionKeyInfo?.x509Data);
  const conditions = unwrap(assertion?.conditions);
  const audienceRestrictions = unwrap(conditions?.audienceRestrictions);
  const audiences = unwrap(audienceRestrictions?.[0]?.audiences);
  const authnStatements = unwrap(assertion?.authnStatements);
  const authnStatement = authnStatements?.[0];
  const authnContext = unwrap(authnStatement?.authnContext);
  const attributeStatements = unwrap(assertion?.attributeStatements);
  const attributes = unwrap(attributeStatements?.[0]?.attributes);

  const sections: SamlMessageSection[] = [
    {
      title: "Response",
      fields: [
        { name: "ID", value: unwrap(parsed.$id) ?? "", description: "Unique identifier" },
        { name: "Version", value: unwrap(parsed.$version) ?? "", description: "SAML version" },
        {
          name: "IssueInstant",
          value: unwrap(parsed.$issueInstant) ?? "",
          description: "Issue time",
        },
        {
          name: "Destination",
          value: unwrap(parsed.$destination) ?? "",
          description: "SP endpoint",
        },
        {
          name: "InResponseTo",
          value: unwrap(parsed.$inResponseTo) ?? "",
          description: "Request ID",
        },
        {
          name: "Issuer",
          value: unwrap(unwrap(parsed.issuer)?.$$content) ?? "",
          description: "IdP entity ID",
        },
      ].filter((f) => f.value !== ""),
    },
    {
      title: "Status",
      fields: [
        {
          name: "StatusCode",
          value: unwrap(unwrap(unwrap(parsed.status)?.statusCode)?.$value) ?? "",
          description: "Response status",
        },
      ].filter((f) => f.value !== ""),
    },
    {
      title: "Response Signature",
      fields: [
        {
          name: "CanonicalizationMethod",
          value: unwrap(unwrap(responseSignedInfo?.canonicalizationMethod)?.$algorithm) ?? "",
          description: "Canonicalization algorithm",
        },
        {
          name: "SignatureMethod",
          value: unwrap(unwrap(responseSignedInfo?.signatureMethod)?.$algorithm) ?? "",
          description: "Signature algorithm",
        },
        {
          name: "Reference URI",
          value: unwrap(responseReference?.$uri) ?? "",
          description: "Signed element reference",
        },
        ...(responseTransforms?.map((t) => ({
          name: "Transform",
          value: unwrap(t?.$algorithm) ?? "",
          description: "Transform algorithm",
        })) ?? []),
        {
          name: "DigestMethod",
          value: unwrap(unwrap(responseReference?.digestMethod)?.$algorithm) ?? "",
          description: "Digest algorithm",
        },
        {
          name: "DigestValue",
          value: unwrap(unwrap(responseReference?.digestValue)?.$$content) ?? "",
          description: "Digest value",
        },
        {
          name: "SignatureValue",
          value: unwrap(unwrap(responseSignature?.signatureValue)?.$$content) ?? "",
          description: "Signature value",
        },
        {
          name: "KeyName",
          value: unwrap(unwrap(responseKeyInfo?.keyName)?.$$content) ?? "",
          description: "Key identifier",
        },
        {
          name: "X509Certificate",
          value: unwrap(unwrap(responseX509Data?.x509Certificate)?.$$content) ?? "",
          description: "X.509 certificate",
        },
      ].filter((f) => f.value !== ""),
    },
    {
      title: "Subject",
      fields: [
        { name: "NameID", value: unwrap(nameId?.$$content) ?? "", description: "User identifier" },
        { name: "NameID Format", value: unwrap(nameId?.$format) ?? "", description: "Format" },
        {
          name: "SubjectConfirmation Method",
          value: unwrap(subjectConfirmation?.$method) ?? "",
          description: "Confirmation method",
        },
        {
          name: "SubjectConfirmationData InResponseTo",
          value: unwrap(subjectConfirmationData?.$inResponseTo) ?? "",
          description: "Corresponding request ID",
        },
        {
          name: "SubjectConfirmationData NotOnOrAfter",
          value: unwrap(subjectConfirmationData?.$notOnOrAfter) ?? "",
          description: "Confirmation expiration",
        },
        {
          name: "SubjectConfirmationData Recipient",
          value: unwrap(subjectConfirmationData?.$recipient) ?? "",
          description: "Intended recipient",
        },
      ].filter((f) => f.value !== ""),
    },
    {
      title: "Assertion",
      fields: [
        { name: "ID", value: unwrap(assertion?.$id) ?? "", description: "Unique identifier" },
        {
          name: "IssueInstant",
          value: unwrap(assertion?.$issueInstant) ?? "",
          description: "Issue time",
        },
        { name: "Version", value: unwrap(assertion?.$version) ?? "", description: "SAML version" },
        {
          name: "Issuer",
          value: unwrap(unwrap(assertion?.issuer)?.$$content) ?? "",
          description: "IdP entity ID",
        },
      ].filter((f) => f.value !== ""),
    },
    {
      title: "Assertion Signature",
      fields: [
        {
          name: "CanonicalizationMethod",
          value: unwrap(unwrap(assertionSignedInfo?.canonicalizationMethod)?.$algorithm) ?? "",
          description: "Canonicalization algorithm",
        },
        {
          name: "SignatureMethod",
          value: unwrap(unwrap(assertionSignedInfo?.signatureMethod)?.$algorithm) ?? "",
          description: "Signature algorithm",
        },
        {
          name: "Reference URI",
          value: unwrap(assertionReference?.$uri) ?? "",
          description: "Signed element reference",
        },
        ...(assertionTransforms?.map((t) => ({
          name: "Transform",
          value: unwrap(t?.$algorithm) ?? "",
          description: "Transform algorithm",
        })) ?? []),
        {
          name: "DigestMethod",
          value: unwrap(unwrap(assertionReference?.digestMethod)?.$algorithm) ?? "",
          description: "Digest algorithm",
        },
        {
          name: "DigestValue",
          value: unwrap(unwrap(assertionReference?.digestValue)?.$$content) ?? "",
          description: "Digest value",
        },
        {
          name: "SignatureValue",
          value: unwrap(unwrap(assertionSignature?.signatureValue)?.$$content) ?? "",
          description: "Signature value",
        },
        {
          name: "KeyName",
          value: unwrap(unwrap(assertionKeyInfo?.keyName)?.$$content) ?? "",
          description: "Key identifier",
        },
        {
          name: "X509Certificate",
          value: unwrap(unwrap(assertionX509Data?.x509Certificate)?.$$content) ?? "",
          description: "X.509 certificate",
        },
      ].filter((f) => f.value !== ""),
    },
    {
      title: "Conditions",
      fields: [
        {
          name: "NotBefore",
          value: unwrap(conditions?.$notBefore) ?? "",
          description: "Validity start",
        },
        {
          name: "NotOnOrAfter",
          value: unwrap(conditions?.$notOnOrAfter) ?? "",
          description: "Validity end",
        },
        ...(audiences?.map((a) => ({
          name: "Audience",
          value: unwrap(a?.$$content) ?? "",
          description: "Intended audience",
        })) ?? []),
      ].filter((f) => f.value !== ""),
    },
    {
      title: "AttributeStatement",
      fields:
        attributes
          ?.flatMap((attr) => {
            const attrName = unwrap(attr?.$name);
            const attrValues = unwrap(attr?.attributeValues);
            if (!attrName || !attrValues) return [];
            // Extract short name from URI (e.g., ".../claims/tenantid" -> "tenantid")
            const shortName = attrName.split("/").pop() ?? attrName;
            return attrValues.map((v) => ({
              name: shortName,
              value: unwrap(v?.$$content) ?? "",
              description: "",
            }));
          })
          .filter((f) => f.value !== "") ?? [],
    },
    {
      title: "AuthnStatement",
      fields: [
        {
          name: "AuthnInstant",
          value: unwrap(authnStatement?.$authnInstant) ?? "",
          description: "Authentication time",
        },
        {
          name: "SessionIndex",
          value: unwrap(authnStatement?.$sessionIndex) ?? "",
          description: "Session identifier",
        },
        {
          name: "SessionNotOnOrAfter",
          value: unwrap(authnStatement?.$sessionNotOnOrAfter) ?? "",
          description: "Session expiration",
        },
        {
          name: "AuthnContextClassRef",
          value: unwrap(unwrap(authnContext?.authnContextClassRef)?.$$content) ?? "",
          description: "Authentication context class",
        },
      ].filter((f) => f.value !== ""),
    },
  ].filter((s) => 0 < s.fields.length);

  return { sections, rawXml };
}

// Convert Error to undefined for easier handling
function unwrap<T>(value: T | Error | undefined): T | undefined {
  if (value === undefined || value instanceof Error) {
    return undefined;
  }
  return value;
}

//
// HttpDetails
//

type HttpMessageDetails = HttpRequestDetails | HttpResponseDetails;

type HttpMessageDetailsBase = {
  headers: Protocol.Fetch.HeaderEntry[];
  body: string;
};

export type HttpRequestDetails = HttpMessageDetailsBase & {
  kind: "request";
  method: string;
  url: string;
};

export type HttpResponseDetails = HttpMessageDetailsBase & {
  kind: "response";
  requestMethod: string;
  requestUrl: string;
  statusCode: number;
  statusText: string;
};

export function buildHttpMessageDetails(httpMessage: HttpMessage): HttpMessageDetails {
  const body = httpMessage.bodyStatus === "loaded" ? httpMessage.body : "";

  if (httpMessage.stage === "Request") {
    return {
      kind: "request",
      method: httpMessage.method,
      url: httpMessage.url,
      headers: httpMessage.headers,
      body,
    };
  } else {
    return {
      kind: "response",
      statusCode: httpMessage.statusCode,
      statusText: getHttpStatusText(httpMessage.statusCode),
      requestMethod: httpMessage.method,
      requestUrl: httpMessage.url,
      headers: httpMessage.headers,
      body,
    };
  }
}
