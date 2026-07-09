/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { XMLParser } from "fast-xml-parser";
import { isObject } from "@/common/utils/type-guard.ts";

// http://www.w3.org/2001/XMLSchema
type XsId = string;
type XsDateTime = string;
type XsAnyUri = string;
type XsNcName = string;

//
// AuthnRequest
//

export function parseSamlpAuthnRequest(samlpAuthnRequestXml: string): SamlpAuthnRequest | Error {
  const parser = new XMLParser({
    alwaysCreateTextNode: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    // Keep text content as strings; SAML text values are all strings/URIs/Base64
    parseTagValue: false,
    // Always treat elements that may appear multiple times as arrays
    isArray: (name: string) => ["AudienceRestriction", "Audience"].includes(name),
  });
  const output = parser.parse(samlpAuthnRequestXml);

  const authnRequestElem = output["AuthnRequest"];
  if (!authnRequestElem) {
    return new Error("AuthnRequest element not found");
  }

  return buildSamlpAuthnRequest(authnRequestElem);
}

// <complexType name="RequestAbstractType" abstract="true">
//   <sequence>
//     <element ref="saml:Issuer" minOccurs="0"/>
//     <element ref="ds:Signature" minOccurs="0"/>
//     <element ref="samlp:Extensions" minOccurs="0"/>
//   </sequence>
//   <attribute name="ID" type="ID" use="required"/>
//   <attribute name="Version" type="string" use="required"/>
//   <attribute name="IssueInstant" type="dateTime" use="required"/>
//   <attribute name="Destination" type="anyURI" use="optional"/>
//   <attribute name="Consent" type="anyURI" use="optional"/>
// </complexType>
type SamlpRequestAbstract = {
  issuer?: SamlNameId | Error;
  $id: XsId | Error;
  $version: string | Error;
  $issueInstant: XsDateTime | Error;
};

// <element name="AuthnRequest" type="samlp:AuthnRequestType"/>
// <complexType name="AuthnRequestType">
//   <complexContent>
//     <extension base="samlp:RequestAbstractType">
//       <sequence>
//         <element ref="saml:Subject" minOccurs="0"/>
//         <element ref="samlp:NameIDPolicy" minOccurs="0"/>
//         <element ref="saml:Conditions" minOccurs="0"/>
//         <element ref="samlp:RequestedAuthnContext" minOccurs="0"/>
//         <element ref="samlp:Scoping" minOccurs="0"/>
//       </sequence>
//       <attribute name="ForceAuthn" type="boolean" use="optional"/>
//       <attribute name="IsPassive" type="boolean" use="optional"/>
//       <attribute name="ProtocolBinding" type="anyURI" use="optional"/>
//       <attribute name="AssertionConsumerServiceIndex" type="unsignedShort" use="optional"/>
//       <attribute name="AssertionConsumerServiceURL" type="anyURI" use="optional"/>
//       <attribute name="AttributeConsumingServiceIndex" type="unsignedShort" use="optional"/>
//       <attribute name="ProviderName" type="string" use="optional"/>
//     </extension>
//   </complexContent>
// </complexType>
export type SamlpAuthnRequest = SamlpRequestAbstract & {
  nameIdPolicy?: SamlpNameIdPolicy | Error;
  conditions?: SamlConditions | Error;
  $forceAuthn?: string | Error;
  $isPassive?: string | Error;
  $protocolBinding?: XsAnyUri | Error;
  $assertionConsumerServiceUrl?: string | Error;
  $providerName?: string | Error;
  $destination?: XsAnyUri | Error;
};

function buildSamlpAuthnRequest(elem: Record<string, unknown>): SamlpAuthnRequest {
  const issuerElem = getChildElement(elem, "Issuer");
  const issuer = issuerElem && buildSamlNameId(issuerElem);

  const idAttr = getStringAttr(elem, "@_ID");
  const $id = idAttr === undefined ? new Error("ID attribute not found") : idAttr;

  const versionAttr = getStringAttr(elem, "@_Version");
  const $version =
    versionAttr === undefined ? new Error("Version attribute not found") : versionAttr;

  const issueInstantAttr = getStringAttr(elem, "@_IssueInstant");
  const $issueInstant =
    issueInstantAttr === undefined
      ? new Error("IssueInstant attribute not found")
      : issueInstantAttr;

  const nameIdPolicyElem = getChildElement(elem, "NameIDPolicy");
  const nameIdPolicy = nameIdPolicyElem && buildSamlNameIdPolicy(nameIdPolicyElem);

  const conditionsElem = getChildElement(elem, "Conditions");
  const conditions = conditionsElem && buildSamlConditions(conditionsElem);

  warnUnhandledKeys("AuthnRequest", elem, [
    "Issuer",
    "@_ID",
    "@_Version",
    "@_IssueInstant",
    "NameIDPolicy",
    "Conditions",
    "@_ForceAuthn",
    "@_IsPassive",
    "@_ProtocolBinding",
    "@_AssertionConsumerServiceURL",
    "@_ProviderName",
    "@_Destination",
  ]);

  return {
    issuer,
    $id,
    $version,
    $issueInstant,
    nameIdPolicy,
    conditions,
    $forceAuthn: getStringAttr(elem, "@_ForceAuthn"),
    $isPassive: getStringAttr(elem, "@_IsPassive"),
    $protocolBinding: getStringAttr(elem, "@_ProtocolBinding"),
    $assertionConsumerServiceUrl: getStringAttr(elem, "@_AssertionConsumerServiceURL"),
    $providerName: getStringAttr(elem, "@_ProviderName"),
    $destination: getStringAttr(elem, "@_Destination"),
  };
}

// <element name="Issuer" type="saml:NameIDType"/>

// <element name="NameID" type="saml:NameIDType"/>
// <complexType name="NameIDType">
//   <simpleContent>
//     <extension base="string">
//       <attributeGroup ref="saml:IDNameQualifiers"/>
//       <attribute name="Format" type="anyURI" use="optional"/>
//       <attribute name="SPProvidedID" type="string" use="optional"/>
//     </extension>
//   </simpleContent>
// </complexType>
export type SamlNameId = {
  $$content: string | Error;
  $format?: XsAnyUri | Error;
};

function buildSamlNameId(elem: Record<string, unknown>): SamlNameId {
  const content = getStringContent(elem);
  const $$content = content === undefined ? new Error("Content not found") : content;

  warnUnhandledKeys("NameID", elem, ["#text", "@_Format"]);

  return {
    $$content,
    $format: getStringAttr(elem, "@_Format"),
  };
}

// <element name="NameIDPolicy" type="samlp:NameIDPolicyType"/>
// <complexType name="NameIDPolicyType">
//   <attribute name="Format" type="anyURI" use="optional"/>
//   <attribute name="SPNameQualifier" type="string" use="optional"/>
//   <attribute name="AllowCreate" type="boolean" use="optional"/>
// </complexType>
export type SamlpNameIdPolicy = {
  $format?: XsAnyUri | Error;
  $allowCreate?: string | Error;
};

function buildSamlNameIdPolicy(elem: Record<string, unknown>): SamlpNameIdPolicy {
  warnUnhandledKeys("NameIDPolicy", elem, ["@_Format", "@_AllowCreate"]);

  return {
    $format: getStringAttr(elem, "@_Format"),
    $allowCreate: getStringAttr(elem, "@_AllowCreate"),
  };
}

//
// Response
//

export function parseSamlpResponse(samlResponseXml: string): SamlpResponse | Error {
  const parser = new XMLParser({
    alwaysCreateTextNode: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    // Keep text content as strings; SAML text values are all strings/URIs/Base64
    parseTagValue: false,
    // Always treat elements that may appear multiple times as arrays
    isArray: (name: string) =>
      [
        "Assertion",
        "AuthnStatement",
        "AttributeStatement",
        "SubjectConfirmation",
        "AudienceRestriction",
        "Audience",
        "Attribute",
        "AttributeValue",
        "Transform",
      ].includes(name),
  });
  const output = parser.parse(samlResponseXml);

  const responseElem = output["Response"];
  if (!responseElem) {
    return new Error("Response element not found");
  }

  return buildSamlpResponse(responseElem);
}

// <complexType name="StatusResponseType">
//   <sequence>
//     <element ref="saml:Issuer" minOccurs="0"/>
//     <element ref="ds:Signature" minOccurs="0"/>
//     <element ref="samlp:Extensions" minOccurs="0"/>
//     <element ref="samlp:Status"/>
//   </sequence>
//   <attribute name="ID" type="ID" use="required"/>
//   <attribute name="InResponseTo" type="NCName" use="optional"/>
//   <attribute name="Version" type="string" use="required"/>
//   <attribute name="IssueInstant" type="dateTime" use="required"/>
//   <attribute name="Destination" type="anyURI" use="optional"/>
//   <attribute name="Consent" type="anyURI" use="optional"/>
// </complexType>
type SamlpStatusResponse = {
  issuer?: SamlNameId | Error;
  signature?: DsSignature | Error;
  status: SamlpStatus | Error;
  $id: XsId | Error;
  $inResponseTo?: XsNcName | Error;
  $version: string | Error;
  $issueInstant: XsDateTime | Error;
  $destination?: XsAnyUri | Error;
};

// <element name="Response" type="samlp:ResponseType"/>
// <complexType name="ResponseType">
//   <complexContent>
//     <extension base="samlp:StatusResponseType">
//       <choice minOccurs="0" maxOccurs="unbounded">
//         <element ref="saml:Assertion"/>
//         <element ref="saml:EncryptedAssertion"/>
//       </choice>
//     </extension>
//   </complexContent>
// </complexType>
export type SamlpResponse = SamlpStatusResponse & {
  assertions?: SamlAssertion[] | Error;
};

function buildSamlpResponse(elem: Record<string, unknown>): SamlpResponse {
  const issuerElem = getChildElement(elem, "Issuer");
  const issuer = issuerElem && buildSamlNameId(issuerElem);

  const signatureElem = getChildElement(elem, "Signature");
  const signature = signatureElem && buildDsSignature(signatureElem);

  const statusElem = getChildElement(elem, "Status");
  const status =
    statusElem === undefined ? new Error("Status element not found") : buildSamlpStatus(statusElem);

  const idAttr = getStringAttr(elem, "@_ID");
  const $id = idAttr === undefined ? new Error("ID attribute not found") : idAttr;

  const versionAttr = getStringAttr(elem, "@_Version");
  const $version =
    versionAttr === undefined ? new Error("Version attribute not found") : versionAttr;

  const issueInstantAttr = getStringAttr(elem, "@_IssueInstant");
  const $issueInstant =
    issueInstantAttr === undefined
      ? new Error("IssueInstant attribute not found")
      : issueInstantAttr;

  const assertionElems = getChildElements(elem, "Assertion");
  const assertions = assertionElems?.map((e) => buildSamlAssertion(e));

  warnUnhandledKeys("Response", elem, [
    "Issuer",
    "Signature",
    "Status",
    "@_ID",
    "@_InResponseTo",
    "@_Version",
    "@_IssueInstant",
    "@_Destination",
    "Assertion",
  ]);

  return {
    issuer,
    signature,
    status,
    $id,
    $inResponseTo: getStringAttr(elem, "@_InResponseTo"),
    $version,
    $issueInstant,
    $destination: getStringAttr(elem, "@_Destination"),
    assertions,
  };
}

// <element name="Status" type="samlp:StatusType"/>
// <complexType name="StatusType">
//   <sequence>
//     <element ref="samlp:StatusCode"/>
//     <element ref="samlp:StatusMessage" minOccurs="0"/>
//     <element ref="samlp:StatusDetail" minOccurs="0"/>
//   </sequence>
// </complexType>
export type SamlpStatus = {
  statusCode: SamlpStatusCode | Error;
};

function buildSamlpStatus(elem: Record<string, unknown>): SamlpStatus {
  const statusCodeElem = getChildElement(elem, "StatusCode");
  const statusCode =
    statusCodeElem === undefined
      ? new Error("StatusCode element not found")
      : buildSamlpStatusCode(statusCodeElem);

  warnUnhandledKeys("Status", elem, ["StatusCode"]);

  return {
    statusCode,
  };
}

// <element name="StatusCode" type="samlp:StatusCodeType"/>
// <complexType name="StatusCodeType">
//   <sequence>
//     <element ref="samlp:StatusCode" minOccurs="0"/>
//   </sequence>
//   <attribute name="Value" type="anyURI" use="required"/>
// </complexType>
type SamlpStatusCode = {
  statusCode?: SamlpStatusCode;
  $value: XsAnyUri | Error;
};

function buildSamlpStatusCode(elem: Record<string, unknown>): SamlpStatusCode {
  const statusCodeElem = getChildElement(elem, "StatusCode");
  const statusCode = statusCodeElem && buildSamlpStatusCode(statusCodeElem);

  const valueAttr = getStringAttr(elem, "@_Value");
  const $value = valueAttr === undefined ? new Error("Value attribute not found") : valueAttr;

  warnUnhandledKeys("StatusCode", elem, ["StatusCode", "@_Value"]);

  return {
    statusCode,
    $value,
  };
}

// <element name="Assertion" type="saml:AssertionType"/>
// <complexType name="AssertionType">
//   <sequence>
//     <element ref="saml:Issuer"/>
//     <element ref="ds:Signature" minOccurs="0"/>
//     <element ref="saml:Subject" minOccurs="0"/>
//     <element ref="saml:Conditions" minOccurs="0"/>
//     <element ref="saml:Advice" minOccurs="0"/>
//     <choice minOccurs="0" maxOccurs="unbounded">
//       <element ref="saml:Statement"/>
//       <element ref="saml:AuthnStatement"/>
//       <element ref="saml:AuthzDecisionStatement"/>
//       <element ref="saml:AttributeStatement"/>
//     </choice>
//   </sequence>
//   <attribute name="Version" type="string" use="required"/>
//   <attribute name="ID" type="ID" use="required"/>
//   <attribute name="IssueInstant" type="dateTime" use="required"/>
// </complexType>
type SamlAssertion = {
  issuer: SamlNameId | Error;
  signature?: DsSignature | Error;
  subject?: SamlSubject | Error;
  conditions?: SamlConditions | Error;
  authnStatements?: SamlAuthnStatement[] | Error;
  attributeStatements?: SamlAttributeStatement[] | Error;
  $version: string | Error;
  $id: XsId | Error;
  $issueInstant: XsDateTime | Error;
};

function buildSamlAssertion(elem: Record<string, unknown>): SamlAssertion {
  const issuerElem = getChildElement(elem, "Issuer");
  const issuer =
    issuerElem === undefined ? new Error("Issuer element not found") : buildSamlNameId(issuerElem);

  const signatureElem = getChildElement(elem, "Signature");
  const signature = signatureElem && buildDsSignature(signatureElem);

  const subjectElem = getChildElement(elem, "Subject");
  const subject = subjectElem && buildSamlSubject(subjectElem);

  const conditionsElem = getChildElement(elem, "Conditions");
  const conditions = conditionsElem && buildSamlConditions(conditionsElem);

  const authnStatementElems = getChildElements(elem, "AuthnStatement");
  const authnStatements = authnStatementElems?.map((e) => buildSamlAuthnStatement(e));

  const attributeStatementElems = getChildElements(elem, "AttributeStatement");
  const attributeStatements = attributeStatementElems?.map((e) => buildSamlAttributeStatement(e));

  const versionAttr = getStringAttr(elem, "@_Version");
  const $version =
    versionAttr === undefined ? new Error("Version attribute not found") : versionAttr;

  const idAttr = getStringAttr(elem, "@_ID");
  const $id = idAttr === undefined ? new Error("ID attribute not found") : idAttr;

  const issueInstantAttr = getStringAttr(elem, "@_IssueInstant");
  const $issueInstant =
    issueInstantAttr === undefined
      ? new Error("IssueInstant attribute not found")
      : issueInstantAttr;

  warnUnhandledKeys("Assertion", elem, [
    "Issuer",
    "Signature",
    "Subject",
    "Conditions",
    "AuthnStatement",
    "AttributeStatement",
    "@_Version",
    "@_ID",
    "@_IssueInstant",
  ]);

  return {
    issuer,
    signature,
    subject,
    conditions,
    authnStatements,
    attributeStatements,
    $version,
    $id,
    $issueInstant,
  };
}

// <element name="Subject" type="saml:SubjectType"/>
// <complexType name="SubjectType">
//   <choice>
//     <sequence>
//       <choice>
//         <element ref="saml:BaseID"/>
//         <element ref="saml:NameID"/>
//         <element ref="saml:EncryptedID"/>
//       </choice>
//       <element ref="saml:SubjectConfirmation" minOccurs="0" maxOccurs="unbounded"/>
//     </sequence>
//     <element ref="saml:SubjectConfirmation" maxOccurs="unbounded"/>
//   </choice>
// </complexType>
type SamlSubject = {
  nameId?: SamlNameId | Error;
  subjectConfirmations?: SamlSubjectConfirmation[] | Error;
};

function buildSamlSubject(elem: Record<string, unknown>): SamlSubject {
  const nameIdElem = getChildElement(elem, "NameID");
  const nameId = nameIdElem && buildSamlNameId(nameIdElem);

  const subjectConfirmationElems = getChildElements(elem, "SubjectConfirmation");
  const subjectConfirmations =
    subjectConfirmationElems === undefined || subjectConfirmationElems.length === 0
      ? // choice element, so presence of nameId matters
        nameId === undefined
        ? new Error("SubjectConfirmation element not found")
        : undefined
      : subjectConfirmationElems.map((e) => buildSamlSubjectConfirmation(e));

  warnUnhandledKeys("Subject", elem, ["NameID", "SubjectConfirmation"]);

  return {
    nameId,
    subjectConfirmations,
  };
}

// <element name="SubjectConfirmation" type="saml:SubjectConfirmationType"/>
// <complexType name="SubjectConfirmationType">
//   <sequence>
//     <choice minOccurs="0">
//       <element ref="saml:BaseID"/>
//       <element ref="saml:NameID"/>
//       <element ref="saml:EncryptedID"/>
//     </choice>
//     <element ref="saml:SubjectConfirmationData" minOccurs="0"/>
//   </sequence>
//   <attribute name="Method" type="anyURI" use="required"/>
// </complexType>
type SamlSubjectConfirmation = {
  subjectConfirmationData?: SamlSubjectConfirmationData | Error;
  $method: XsAnyUri | Error;
};

function buildSamlSubjectConfirmation(elem: Record<string, unknown>): SamlSubjectConfirmation {
  const subjectConfirmationDataElem = getChildElement(elem, "SubjectConfirmationData");
  const subjectConfirmationData =
    subjectConfirmationDataElem && buildSamlSubjectConfirmationData(subjectConfirmationDataElem);

  const methodAttr = getStringAttr(elem, "@_Method");
  const $method = methodAttr === undefined ? new Error("Method attribute not found") : methodAttr;

  warnUnhandledKeys("SubjectConfirmation", elem, ["SubjectConfirmationData", "@_Method"]);

  return {
    subjectConfirmationData,
    $method,
  };
}

// <element name="SubjectConfirmationData" type="saml:SubjectConfirmationDataType"/>
// <complexType name="SubjectConfirmationDataType" mixed="true">
//   <complexContent>
//     <restriction base="anyType">
//       <sequence>
//         <any namespace="##any" processContents="lax" minOccurs="0" maxOccurs="unbounded"/>
//       </sequence>
//       <attribute name="NotBefore" type="dateTime" use="optional"/>
//       <attribute name="NotOnOrAfter" type="dateTime" use="optional"/>
//       <attribute name="Recipient" type="anyURI" use="optional"/>
//       <attribute name="InResponseTo" type="NCName" use="optional"/>
//       <attribute name="Address" type="string" use="optional"/>
//       <anyAttribute namespace="##other" processContents="lax"/>
//     </restriction>
//   </complexContent>
// </complexType>

type SamlSubjectConfirmationData = {
  $notOnOrAfter?: XsDateTime | Error;
  $recipient?: XsAnyUri | Error;
  $inResponseTo?: XsNcName | Error;
};

function buildSamlSubjectConfirmationData(
  elem: Record<string, unknown>,
): SamlSubjectConfirmationData {
  warnUnhandledKeys("SubjectConfirmationData", elem, [
    "@_NotOnOrAfter",
    "@_Recipient",
    "@_InResponseTo",
  ]);

  return {
    $notOnOrAfter: getStringAttr(elem, "@_NotOnOrAfter"),
    $recipient: getStringAttr(elem, "@_Recipient"),
    $inResponseTo: getStringAttr(elem, "@_InResponseTo"),
  };
}

// <element name="Conditions" type="saml:ConditionsType"/>
// <complexType name="ConditionsType">
//   <choice minOccurs="0" maxOccurs="unbounded">
//     <element ref="saml:Condition"/>
//     <element ref="saml:AudienceRestriction"/>
//     <element ref="saml:OneTimeUse"/>
//     <element ref="saml:ProxyRestriction"/>
//   </choice>
//   <attribute name="NotBefore" type="dateTime" use="optional"/>
//   <attribute name="NotOnOrAfter" type="dateTime" use="optional"/>
// </complexType>

type SamlConditions = {
  audienceRestrictions?: SamlAudienceRestriction[] | Error;
  $notBefore?: XsDateTime | Error;
  $notOnOrAfter?: XsDateTime | Error;
};

function buildSamlConditions(elem: Record<string, unknown>): SamlConditions {
  const audienceRestrictionElems = getChildElements(elem, "AudienceRestriction");
  const audienceRestrictions = audienceRestrictionElems?.map((e) =>
    buildSamlAudienceRestriction(e),
  );

  warnUnhandledKeys("Conditions", elem, ["AudienceRestriction", "@_NotBefore", "@_NotOnOrAfter"]);

  return {
    audienceRestrictions,
    $notBefore: getStringAttr(elem, "@_NotBefore"),
    $notOnOrAfter: getStringAttr(elem, "@_NotOnOrAfter"),
  };
}

// <element name="Condition" type="saml:ConditionAbstractType"/>
// <complexType name="ConditionAbstractType" abstract="true"/>

// <element name="AudienceRestriction" type="saml:AudienceRestrictionType"/>
// <complexType name="AudienceRestrictionType">
//   <complexContent>
//     <extension base="saml:ConditionAbstractType">
//     <sequence>
//       <element ref="saml:Audience" maxOccurs="unbounded"/>
//     </sequence>
//     </extension>
//   </complexContent>
// </complexType>

type SamlAudienceRestriction = {
  audiences: SamlAudience[] | Error;
};

function buildSamlAudienceRestriction(elem: Record<string, unknown>): SamlAudienceRestriction {
  const audienceElems = getChildElements(elem, "Audience");
  const audiences =
    audienceElems === undefined || audienceElems.length === 0
      ? new Error("Audience element not found")
      : audienceElems.map((e) => buildSamlAudience(e));

  warnUnhandledKeys("AudienceRestriction", elem, ["Audience"]);

  return {
    audiences,
  };
}

// <element name="Audience" type="anyURI"/>

type SamlAudience = {
  $$content: XsAnyUri | Error;
};

function buildSamlAudience(elem: Record<string, unknown>): SamlAudience {
  const content = getStringContent(elem);
  const $$content = content === undefined ? new Error("Audience element is empty") : content;

  warnUnhandledKeys("Audience", elem, ["#text"]);

  return {
    $$content,
  };
}

// <element name="Statement" type="saml:StatementAbstractType"/>
// <complexType name="StatementAbstractType" abstract="true"/>

// <element name="AuthnStatement" type="saml:AuthnStatementType"/>
// <complexType name="AuthnStatementType">
//   <complexContent>
//     <extension base="saml:StatementAbstractType">
//     <sequence>
//       <element ref="saml:SubjectLocality" minOccurs="0"/>
//       <element ref="saml:AuthnContext"/>
//     </sequence>
//     <attribute name="AuthnInstant" type="dateTime" use="required"/>
//     <attribute name="SessionIndex" type="string" use="optional"/>
//     <attribute name="SessionNotOnOrAfter" type="dateTime" use="optional"/>
//     </extension>
//   </complexContent>
// </complexType>

type SamlAuthnStatement = {
  authnContext: SamlAuthnContext | Error;
  $authnInstant: XsDateTime | Error;
  $sessionIndex?: string | Error;
  $sessionNotOnOrAfter?: XsDateTime | Error;
};

function buildSamlAuthnStatement(elem: Record<string, unknown>): SamlAuthnStatement {
  const authnContextElem = getChildElement(elem, "AuthnContext");
  const authnContext =
    authnContextElem === undefined
      ? new Error("AuthnContext element not found")
      : buildSamlAuthnContext(authnContextElem);

  const authnInstantAttr = getStringAttr(elem, "@_AuthnInstant");
  const $authnInstant =
    authnInstantAttr === undefined
      ? new Error("AuthnInstant attribute not found")
      : authnInstantAttr;

  warnUnhandledKeys("AuthnStatement", elem, [
    "AuthnContext",
    "@_AuthnInstant",
    "@_SessionIndex",
    "@_SessionNotOnOrAfter",
  ]);

  return {
    authnContext,
    $authnInstant,
    $sessionIndex: getStringAttr(elem, "@_SessionIndex"),
    $sessionNotOnOrAfter: getStringAttr(elem, "@_SessionNotOnOrAfter"),
  };
}

// <element name="AuthnContext" type="saml:AuthnContextType"/>
// <complexType name="AuthnContextType">
//   <sequence>
//     <choice>
//       <sequence>
//         <element ref="saml:AuthnContextClassRef"/>
//         <choice minOccurs="0">
//           <element ref="saml:AuthnContextDecl"/>
//           <element ref="saml:AuthnContextDeclRef"/>
//         </choice>
//       </sequence>
//       <choice>
//         <element ref="saml:AuthnContextDecl"/>
//         <element ref="saml:AuthnContextDeclRef"/>
//       </choice>
//     </choice>
//     <element ref="saml:AuthenticatingAuthority" minOccurs="0" maxOccurs="unbounded"/>
//   </sequence>
// </complexType>

type SamlAuthnContext = {
  authnContextClassRef?: SamlAuthnContextClassRef | Error;
};

function buildSamlAuthnContext(elem: Record<string, unknown>): SamlAuthnContext {
  const authnContextClassRefElem = getChildElement(elem, "AuthnContextClassRef");
  const authnContextClassRef =
    authnContextClassRefElem && buildSamlAuthnContextClassRef(authnContextClassRefElem);

  warnUnhandledKeys("AuthnContext", elem, ["AuthnContextClassRef"]);

  return {
    authnContextClassRef,
  };
}

// <element name="AuthnContextClassRef" type="anyURI"/>

type SamlAuthnContextClassRef = {
  $$content: XsAnyUri | Error;
};

function buildSamlAuthnContextClassRef(elem: Record<string, unknown>): SamlAuthnContextClassRef {
  const content = getStringContent(elem);
  const $$content =
    content === undefined ? new Error("AuthnContextClassRef element is empty") : content;

  warnUnhandledKeys("AuthnContextClassRef", elem, ["#text"]);

  return {
    $$content,
  };
}

// <element name="Statement" type="saml:StatementAbstractType"/>
// <complexType name="StatementAbstractType" abstract="true"/>

// <element name="AttributeStatement" type="saml:AttributeStatementType"/>
// <complexType name="AttributeStatementType">
//   <complexContent>
//     <extension base="saml:StatementAbstractType">
//       <choice maxOccurs="unbounded">
//         <element ref="saml:Attribute"/>
//         <element ref="saml:EncryptedAttribute"/>
//       </choice>
//     </extension>
//   </complexContent>
// </complexType>

type SamlAttributeStatement = {
  attributes: SamlAttribute[] | Error;
};

function buildSamlAttributeStatement(elem: Record<string, unknown>): SamlAttributeStatement {
  const attributeElems = getChildElements(elem, "Attribute");
  const attributes =
    attributeElems === undefined || attributeElems.length === 0
      ? new Error("Attribute element not found")
      : attributeElems.map((e) => buildSamlAttribute(e));

  warnUnhandledKeys("AttributeStatement", elem, ["Attribute"]);

  return {
    attributes,
  };
}

// <element name="Attribute" type="saml:AttributeType"/>
// <complexType name="AttributeType">
//   <sequence>
//     <element ref="saml:AttributeValue" minOccurs="0" maxOccurs="unbounded"/>
//   </sequence>
//   <attribute name="Name" type="string" use="required"/>
//   <attribute name="NameFormat" type="anyURI" use="optional"/>
//   <attribute name="FriendlyName" type="string" use="optional"/>
//   <anyAttribute namespace="##other" processContents="lax"/>
// </complexType>

type SamlAttribute = {
  attributeValues?: SamlAttributeValue[] | Error;
  $name: string | Error;
  $nameFormat?: XsAnyUri | Error;
  $friendlyName?: string | Error;
};

function buildSamlAttribute(elem: Record<string, unknown>): SamlAttribute {
  const attributeValueElems = getChildElements(elem, "AttributeValue");
  const attributeValues = attributeValueElems?.map((e) => buildSamlAttributeValue(e));

  const nameAttr = getStringAttr(elem, "@_Name");
  const $name = nameAttr === undefined ? new Error("Name attribute not found") : nameAttr;

  warnUnhandledKeys("Attribute", elem, [
    "AttributeValue",
    "@_Name",
    "@_NameFormat",
    "@_FriendlyName",
  ]);

  return {
    attributeValues,
    $name,
    $nameFormat: getStringAttr(elem, "@_NameFormat"),
    $friendlyName: getStringAttr(elem, "@_FriendlyName"),
  };
}

// <element name="AttributeValue" type="anyType" nillable="true"/>

type SamlAttributeValue = {
  // Defined as anyType in schema, but treated as a string here
  $$content: string | Error;
  // xsi:type attribute; namespace prefix is stripped by removeNSPrefix
  $xsiType?: string | Error;
};

function buildSamlAttributeValue(elem: Record<string, unknown>): SamlAttributeValue {
  // Nillable in schema, but xsi:nil check is skipped; nil values are treated as empty strings
  const content = getStringContent(elem);
  const $$content = content === undefined ? new Error("AttributeValue element is empty") : content;

  warnUnhandledKeys("AttributeValue", elem, ["#text", "@_type"]);

  return {
    $$content,
    $xsiType: getStringAttr(elem, "@_type"),
  };
}

//
// http://www.w3.org/2000/09/xmldsig#
//

type DsSignature = {
  signedInfo: DsSignedInfo | Error;
  signatureValue: DsSignatureValue | Error;
  keyInfo?: DsKeyInfo | Error;
};

function buildDsSignature(elem: Record<string, unknown>): DsSignature {
  const signedInfoElem = getChildElement(elem, "SignedInfo");
  const signedInfo =
    signedInfoElem === undefined
      ? new Error("SignedInfo element not found")
      : buildDsSignedInfo(signedInfoElem);

  const signatureValueElem = getChildElement(elem, "SignatureValue");
  const signatureValue =
    signatureValueElem === undefined
      ? new Error("SignatureValue element not found")
      : buildDsSignatureValue(signatureValueElem);

  const keyInfoElem = getChildElement(elem, "KeyInfo");
  const keyInfo = keyInfoElem && buildDsKeyInfo(keyInfoElem);

  warnUnhandledKeys("Signature", elem, ["SignedInfo", "SignatureValue", "KeyInfo"]);

  return {
    signedInfo,
    signatureValue,
    keyInfo,
  };
}

type DsSignedInfo = {
  canonicalizationMethod: DsCanonicalizationMethod | Error;
  signatureMethod: DsSignatureMethod | Error;
  reference: DsReference | Error;
};

function buildDsSignedInfo(elem: Record<string, unknown>): DsSignedInfo {
  const canonicalizationMethodElem = getChildElement(elem, "CanonicalizationMethod");
  const canonicalizationMethod =
    canonicalizationMethodElem === undefined
      ? new Error("CanonicalizationMethod element not found")
      : buildDsCanonicalizationMethod(canonicalizationMethodElem);

  const signatureMethodElem = getChildElement(elem, "SignatureMethod");
  const signatureMethod =
    signatureMethodElem === undefined
      ? new Error("SignatureMethod element not found")
      : buildDsSignatureMethod(signatureMethodElem);

  const referenceElem = getChildElement(elem, "Reference");
  const reference =
    referenceElem === undefined
      ? new Error("Reference element not found")
      : buildDsReference(referenceElem);

  warnUnhandledKeys("SignedInfo", elem, ["CanonicalizationMethod", "SignatureMethod", "Reference"]);

  return {
    canonicalizationMethod,
    signatureMethod,
    reference,
  };
}

type DsCanonicalizationMethod = {
  $algorithm: string | Error;
};

function buildDsCanonicalizationMethod(elem: Record<string, unknown>): DsCanonicalizationMethod {
  const algorithmAttr = getStringAttr(elem, "@_Algorithm");
  const $algorithm =
    algorithmAttr === undefined ? new Error("Algorithm attribute not found") : algorithmAttr;

  warnUnhandledKeys("CanonicalizationMethod", elem, ["@_Algorithm"]);

  return { $algorithm };
}

type DsSignatureMethod = {
  $algorithm: string | Error;
};

function buildDsSignatureMethod(elem: Record<string, unknown>): DsSignatureMethod {
  const algorithmAttr = getStringAttr(elem, "@_Algorithm");
  const $algorithm =
    algorithmAttr === undefined ? new Error("Algorithm attribute not found") : algorithmAttr;

  warnUnhandledKeys("SignatureMethod", elem, ["@_Algorithm"]);

  return { $algorithm };
}

type DsReference = {
  transforms?: DsTransform[] | Error;
  digestMethod: DsDigestMethod | Error;
  digestValue: DsDigestValue | Error;
  $uri?: string | Error;
};

function buildDsReference(elem: Record<string, unknown>): DsReference {
  const transformsElem = getChildElement(elem, "Transforms");
  const transformElems = transformsElem && getChildElements(transformsElem, "Transform");
  const transforms = transformElems?.map((e) => buildDsTransform(e));

  const digestMethodElem = getChildElement(elem, "DigestMethod");
  const digestMethod =
    digestMethodElem === undefined
      ? new Error("DigestMethod element not found")
      : buildDsDigestMethod(digestMethodElem);

  const digestValueElem = getChildElement(elem, "DigestValue");
  const digestValue =
    digestValueElem === undefined
      ? new Error("DigestValue element not found")
      : buildDsDigestValue(digestValueElem);

  warnUnhandledKeys("Reference", elem, ["Transforms", "DigestMethod", "DigestValue", "@_URI"]);

  return {
    transforms,
    digestMethod,
    digestValue,
    $uri: getStringAttr(elem, "@_URI"),
  };
}

type DsTransform = {
  $algorithm: string | Error;
};

function buildDsTransform(elem: Record<string, unknown>): DsTransform {
  const algorithmAttr = getStringAttr(elem, "@_Algorithm");
  const $algorithm =
    algorithmAttr === undefined ? new Error("Algorithm attribute not found") : algorithmAttr;

  warnUnhandledKeys("Transform", elem, ["@_Algorithm"]);

  return { $algorithm };
}

type DsDigestMethod = {
  $algorithm: string | Error;
};

function buildDsDigestMethod(elem: Record<string, unknown>): DsDigestMethod {
  const algorithmAttr = getStringAttr(elem, "@_Algorithm");
  const $algorithm =
    algorithmAttr === undefined ? new Error("Algorithm attribute not found") : algorithmAttr;

  warnUnhandledKeys("DigestMethod", elem, ["@_Algorithm"]);

  return { $algorithm };
}

type DsDigestValue = {
  $$content: string | Error;
};

function buildDsDigestValue(elem: Record<string, unknown>): DsDigestValue {
  const content = getStringContent(elem);
  const $$content = content === undefined ? new Error("DigestValue element is empty") : content;

  warnUnhandledKeys("DigestValue", elem, ["#text"]);

  return { $$content };
}

type DsSignatureValue = {
  $$content: string | Error;
};

function buildDsSignatureValue(elem: Record<string, unknown>): DsSignatureValue {
  const content = getStringContent(elem);
  const $$content = content === undefined ? new Error("SignatureValue element is empty") : content;

  warnUnhandledKeys("SignatureValue", elem, ["#text"]);

  return { $$content };
}

type DsKeyInfo = {
  x509Data?: DsX509Data | Error;
  keyName?: DsKeyName | Error;
};

function buildDsKeyInfo(elem: Record<string, unknown>): DsKeyInfo {
  const x509DataElem = getChildElement(elem, "X509Data");
  const x509Data = x509DataElem && buildDsX509Data(x509DataElem);

  const keyNameElem = getChildElement(elem, "KeyName");
  const keyName = keyNameElem && buildDsKeyName(keyNameElem);

  warnUnhandledKeys("KeyInfo", elem, ["X509Data", "KeyName"]);

  return { x509Data, keyName };
}

type DsKeyName = {
  $$content: string | Error;
};

function buildDsKeyName(elem: Record<string, unknown>): DsKeyName {
  const content = getStringContent(elem);
  const $$content = content === undefined ? new Error("KeyName element is empty") : content;

  warnUnhandledKeys("KeyName", elem, ["#text"]);

  return { $$content };
}

type DsX509Data = {
  x509Certificate?: DsX509Certificate | Error;
};

function buildDsX509Data(elem: Record<string, unknown>): DsX509Data {
  const x509CertificateElem = getChildElement(elem, "X509Certificate");
  const x509Certificate = x509CertificateElem && buildDsX509Certificate(x509CertificateElem);

  warnUnhandledKeys("X509Data", elem, ["X509Certificate"]);

  return { x509Certificate };
}

type DsX509Certificate = {
  $$content: string | Error;
};

function buildDsX509Certificate(elem: Record<string, unknown>): DsX509Certificate {
  const content = getStringContent(elem);
  const $$content = content === undefined ? new Error("X509Certificate element is empty") : content;

  warnUnhandledKeys("X509Certificate", elem, ["#text"]);

  return { $$content };
}

//
// Helpers
//

function getChildElement(
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  return isObject(obj[key]) ? obj[key] : undefined;
}

function getChildElements(
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] | undefined {
  return Array.isArray(obj[key]) ? obj[key] : undefined;
}

function getStringAttr(elem: Record<string, unknown>, name: string): string | undefined {
  return getStringProperty(elem, name);
}

function getStringContent(elem: Record<string, unknown>): string | undefined {
  return getStringProperty(elem, "#text");
}

function getStringProperty(obj: Record<string, unknown>, key: string): string | undefined {
  return typeof obj[key] === "string" ? obj[key] : undefined;
}

function warnUnhandledKeys(context: string, elem: Record<string, unknown>, handledKeys: string[]) {
  const handled = new Set(handledKeys);
  const unhandled = Object.keys(elem).filter((k) => !handled.has(k) && !isIgnorableKey(elem, k));
  if (0 < unhandled.length) {
    console.warn(`Unhandled keys in ${context}:`, unhandled);
  }
}

function isIgnorableKey(elem: Record<string, unknown>, key: string): boolean {
  return (
    key.startsWith("@_xmlns") ||
    // fast-xml-parser's alwaysCreateTextNode option keeps text-only elements (e.g. Audience)
    // as objects rather than plain strings, so every element builder can treat elem
    // uniformly. As a side effect, it also adds an empty #text to attribute-only elements
    // (e.g. self-closing tags); that's a parsing artifact, not real SAML data.
    // If a builder forgets to list "#text" in handledKeys for an element that the schema
    // says does carry text, and the real data happens to be empty, this mistake will not
    // be detected. This is unavoidable as long as alwaysCreateTextNode is used.
    (key === "#text" && getStringContent(elem) === "")
  );
}
