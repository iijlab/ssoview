/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { describe, expect, it, vi } from "vitest";
import { parseSamlpAuthnRequest, parseSamlpResponse } from "./saml-parser.ts";

describe("parseSamlpAuthnRequest", () => {
  it("parses valid AuthnRequest with namespace prefix", () => {
    const xml = `
      <samlp:AuthnRequest
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        ID="_abc123"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:00Z"
        ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
        AssertionConsumerServiceURL="https://sp.example.com/acs"
        ProviderName="My SP"
        Destination="https://idp.example.org/sso">
        <saml:Issuer>https://sp.example.com</saml:Issuer>
        <samlp:NameIDPolicy
          Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
          AllowCreate="true"/>
      </samlp:AuthnRequest>
    `;

    const result = parseSamlpAuthnRequest(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    expect(result.$id).toBe("_abc123");
    expect(result.$version).toBe("2.0");
    expect(result.$issueInstant).toBe("2026-01-01T00:00:00Z");
    expect(result.$protocolBinding).toBe("urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST");
    expect(result.$assertionConsumerServiceUrl).toBe("https://sp.example.com/acs");
    expect(result.$providerName).toBe("My SP");
    expect(result.$destination).toBe("https://idp.example.org/sso");

    expect(result.issuer).toBeDefined();
    expect(result.issuer).not.toBeInstanceOf(Error);
    if (!result.issuer || result.issuer instanceof Error) return;
    expect(result.issuer.$$content).toBe("https://sp.example.com");

    expect(result.nameIdPolicy).toBeDefined();
    expect(result.nameIdPolicy).not.toBeInstanceOf(Error);
    if (!result.nameIdPolicy || result.nameIdPolicy instanceof Error) return;
    expect(result.nameIdPolicy.$format).toBe(
      "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    );
    expect(result.nameIdPolicy.$allowCreate).toBe("true");
  });

  it("parses valid AuthnRequest with saml2p namespace prefix", () => {
    const xml = `
      <saml2p:AuthnRequest
        xmlns:saml2p="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion"
        ID="_abc123"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:00Z"
        ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
        AssertionConsumerServiceURL="https://sp.example.com/acs"
        Destination="https://idp.example.org/sso">
        <saml2:Issuer>https://sp.example.com</saml2:Issuer>
        <saml2p:NameIDPolicy
          Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
          AllowCreate="true"/>
      </saml2p:AuthnRequest>
    `;

    const result = parseSamlpAuthnRequest(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    expect(result.$id).toBe("_abc123");
    expect(result.$version).toBe("2.0");
    expect(result.$issueInstant).toBe("2026-01-01T00:00:00Z");
    expect(result.$protocolBinding).toBe("urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST");
    expect(result.$assertionConsumerServiceUrl).toBe("https://sp.example.com/acs");
    expect(result.$destination).toBe("https://idp.example.org/sso");

    expect(result.issuer).toBeDefined();
    expect(result.issuer).not.toBeInstanceOf(Error);
    if (!result.issuer || result.issuer instanceof Error) return;
    expect(result.issuer.$$content).toBe("https://sp.example.com");

    expect(result.nameIdPolicy).toBeDefined();
    expect(result.nameIdPolicy).not.toBeInstanceOf(Error);
    if (!result.nameIdPolicy || result.nameIdPolicy instanceof Error) return;
    expect(result.nameIdPolicy.$format).toBe(
      "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    );
    expect(result.nameIdPolicy.$allowCreate).toBe("true");
  });

  it("parses ForceAuthn and IsPassive attributes", () => {
    const xml = `
      <samlp:AuthnRequest
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        ID="_abc123"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:00Z"
        ForceAuthn="true"
        IsPassive="false">
      </samlp:AuthnRequest>
    `;

    const result = parseSamlpAuthnRequest(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    expect(result.$forceAuthn).toBe("true");
    expect(result.$isPassive).toBe("false");
  });

  it("returns undefined for ForceAuthn and IsPassive when not present", () => {
    const xml = `
      <samlp:AuthnRequest
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        ID="_abc123"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:00Z">
      </samlp:AuthnRequest>
    `;

    const result = parseSamlpAuthnRequest(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    expect(result.$forceAuthn).toBeUndefined();
    expect(result.$isPassive).toBeUndefined();
  });

  it("parses valid AuthnRequest without namespace prefix", () => {
    const xml = `
      <AuthnRequest
        ID="_def456"
        Version="2.0"
        IssueInstant="2026-01-01T12:00:00Z">
        <Issuer>https://sp2.example.com</Issuer>
      </AuthnRequest>
    `;

    const result = parseSamlpAuthnRequest(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    expect(result.$id).toBe("_def456");
    expect(result.$version).toBe("2.0");

    expect(result.issuer).toBeDefined();
    expect(result.issuer).not.toBeInstanceOf(Error);
    if (!result.issuer || result.issuer instanceof Error) return;
    expect(result.issuer.$$content).toBe("https://sp2.example.com");
  });

  it("returns Error when AuthnRequest element is missing", () => {
    const xml = `<SomeOtherElement/>`;

    const result = parseSamlpAuthnRequest(xml);
    expect(result).toBeInstanceOf(Error);
    if (!(result instanceof Error)) return;
    expect(result.message).toBe("AuthnRequest element not found");
  });

  it("parses Conditions element", () => {
    const xml = `
      <samlp:AuthnRequest
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        ID="_abc123"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:00Z">
        <saml:Conditions
          NotBefore="2026-01-01T00:00:00Z"
          NotOnOrAfter="2026-01-01T00:05:00Z">
          <saml:AudienceRestriction>
            <saml:Audience>https://sp.example.com</saml:Audience>
          </saml:AudienceRestriction>
        </saml:Conditions>
      </samlp:AuthnRequest>
    `;

    const result = parseSamlpAuthnRequest(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    expect(result.conditions).toBeDefined();
    expect(result.conditions).not.toBeInstanceOf(Error);
    if (!result.conditions || result.conditions instanceof Error) return;

    expect(result.conditions.$notBefore).toBe("2026-01-01T00:00:00Z");
    expect(result.conditions.$notOnOrAfter).toBe("2026-01-01T00:05:00Z");

    expect(result.conditions.audienceRestrictions).toBeDefined();
    if (
      !result.conditions.audienceRestrictions ||
      result.conditions.audienceRestrictions instanceof Error
    )
      return;
    expect(result.conditions.audienceRestrictions).toHaveLength(1);
    const firstRestriction = result.conditions.audienceRestrictions[0];
    if (!firstRestriction) return;
    const audiences = firstRestriction.audiences;
    if (!audiences || audiences instanceof Error) return;
    expect(audiences).toHaveLength(1);
    expect(audiences[0]?.$$content).toBe("https://sp.example.com");
  });

  it("returns undefined for conditions when not present", () => {
    const xml = `
      <samlp:AuthnRequest
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        ID="_abc123"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:00Z">
      </samlp:AuthnRequest>
    `;

    const result = parseSamlpAuthnRequest(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    expect(result.conditions).toBeUndefined();
  });

  it("returns Error in $id when ID attribute is missing", () => {
    const xml = `
      <samlp:AuthnRequest
        Version="2.0"
        IssueInstant="2026-01-01T00:00:00Z">
      </samlp:AuthnRequest>
    `;

    const result = parseSamlpAuthnRequest(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    expect(result.$id).toBeInstanceOf(Error);
  });
});

describe("warnUnhandledKeys #text handling", () => {
  it("does not warn about the empty #text artifact on an attribute-only element", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const xml = `
      <samlp:AuthnRequest
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        ID="_abc123"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:00Z">
        <samlp:NameIDPolicy
          Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
          AllowCreate="true"/>
      </samlp:AuthnRequest>
    `;

    const result = parseSamlpAuthnRequest(xml);
    expect(result).not.toBeInstanceOf(Error);

    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining("NameIDPolicy"), ["#text"]);

    warnSpy.mockRestore();
  });

  it("still warns when an unhandled element has meaningful #text content", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const xml = `
      <samlp:AuthnRequest
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        ID="_abc123"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:00Z">
        <samlp:NameIDPolicy
          Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
          AllowCreate="true">unexpected</samlp:NameIDPolicy>
      </samlp:AuthnRequest>
    `;

    const result = parseSamlpAuthnRequest(xml);
    expect(result).not.toBeInstanceOf(Error);

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("NameIDPolicy"), ["#text"]);

    warnSpy.mockRestore();
  });
});

describe("parseSamlpResponse", () => {
  it("parses valid Response with namespace prefix", () => {
    const xml = `
      <samlp:Response
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        ID="_resp123"
        InResponseTo="_abc123"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:05Z"
        Destination="https://sp.example.com/acs">
        <saml:Issuer>https://idp.example.org</saml:Issuer>
        <samlp:Status>
          <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
        </samlp:Status>
        <saml:Assertion Version="2.0" ID="_assert123" IssueInstant="2026-01-01T00:00:05Z">
          <saml:Issuer>https://idp.example.org</saml:Issuer>
          <saml:Subject>
            <saml:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">user@example.com</saml:NameID>
            <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
              <saml:SubjectConfirmationData
                NotOnOrAfter="2026-01-01T00:05:00Z"
                Recipient="https://sp.example.com/acs"
                InResponseTo="_abc123"/>
            </saml:SubjectConfirmation>
          </saml:Subject>
          <saml:Conditions NotBefore="2026-01-01T00:00:00Z" NotOnOrAfter="2026-01-01T00:05:00Z">
            <saml:AudienceRestriction>
              <saml:Audience>https://sp.example.com</saml:Audience>
            </saml:AudienceRestriction>
          </saml:Conditions>
          <saml:AuthnStatement AuthnInstant="2026-01-01T00:00:00Z" SessionIndex="_session123">
            <saml:AuthnContext>
              <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:Password</saml:AuthnContextClassRef>
            </saml:AuthnContext>
          </saml:AuthnStatement>
          <saml:AttributeStatement>
            <saml:Attribute Name="email">
              <saml:AttributeValue>user@example.com</saml:AttributeValue>
            </saml:Attribute>
          </saml:AttributeStatement>
        </saml:Assertion>
      </samlp:Response>
    `;

    const result = parseSamlpResponse(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    expect(result.$id).toBe("_resp123");
    expect(result.$inResponseTo).toBe("_abc123");
    expect(result.$version).toBe("2.0");
    expect(result.$issueInstant).toBe("2026-01-01T00:00:05Z");
    expect(result.$destination).toBe("https://sp.example.com/acs");

    expect(result.issuer).toBeDefined();
    expect(result.issuer).not.toBeInstanceOf(Error);
    if (!result.issuer || result.issuer instanceof Error) return;
    expect(result.issuer.$$content).toBe("https://idp.example.org");

    // Status
    expect(result.status).not.toBeInstanceOf(Error);
    if (result.status instanceof Error) return;
    expect(result.status.statusCode).not.toBeInstanceOf(Error);
    if (result.status.statusCode instanceof Error) return;
    expect(result.status.statusCode.$value).toBe("urn:oasis:names:tc:SAML:2.0:status:Success");

    // Assertion
    expect(result.assertions).toBeDefined();
    expect(result.assertions).not.toBeInstanceOf(Error);
    if (!result.assertions || result.assertions instanceof Error) return;
    expect(result.assertions.length).toBe(1);

    const assertion = result.assertions[0]!;
    expect(assertion.$id).toBe("_assert123");
    expect(assertion.issuer).not.toBeInstanceOf(Error);
    if (assertion.issuer instanceof Error) return;
    expect(assertion.issuer.$$content).toBe("https://idp.example.org");

    // Subject
    expect(assertion.subject).not.toBeInstanceOf(Error);
    if (!assertion.subject || assertion.subject instanceof Error) return;
    expect(assertion.subject.nameId).not.toBeInstanceOf(Error);
    if (assertion.subject.nameId instanceof Error) return;
    expect(assertion.subject.nameId?.$$content).toBe("user@example.com");

    // Conditions
    expect(assertion.conditions).not.toBeInstanceOf(Error);
    if (!assertion.conditions || assertion.conditions instanceof Error) return;
    expect(assertion.conditions.$notBefore).toBe("2026-01-01T00:00:00Z");
    expect(assertion.conditions.$notOnOrAfter).toBe("2026-01-01T00:05:00Z");

    // AuthnStatement
    expect(assertion.authnStatements).not.toBeInstanceOf(Error);
    if (!assertion.authnStatements || assertion.authnStatements instanceof Error) return;
    expect(assertion.authnStatements.length).toBe(1);
    expect(assertion.authnStatements[0]!.$sessionIndex).toBe("_session123");

    // AttributeStatement
    expect(assertion.attributeStatements).not.toBeInstanceOf(Error);
    if (!assertion.attributeStatements || assertion.attributeStatements instanceof Error) return;
    expect(assertion.attributeStatements.length).toBe(1);
    const attrStmt = assertion.attributeStatements[0]!;
    expect(attrStmt.attributes).not.toBeInstanceOf(Error);
    if (attrStmt.attributes instanceof Error) return;
    expect(attrStmt.attributes[0]!.$name).toBe("email");
  });

  it("parses valid Response with saml2p namespace prefix", () => {
    const xml = `
      <saml2p:Response
        xmlns:saml2p="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml2="urn:oasis:names:tc:SAML:2.0:assertion"
        ID="_resp123"
        InResponseTo="_abc123"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:05Z"
        Destination="https://sp.example.com/acs">
        <saml2:Issuer>https://idp.example.org</saml2:Issuer>
        <saml2p:Status>
          <saml2p:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
        </saml2p:Status>
        <saml2:Assertion Version="2.0" ID="_assert123" IssueInstant="2026-01-01T00:00:05Z">
          <saml2:Issuer>https://idp.example.org</saml2:Issuer>
          <saml2:Subject>
            <saml2:NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">user@example.com</saml2:NameID>
            <saml2:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
              <saml2:SubjectConfirmationData
                NotOnOrAfter="2026-01-01T00:05:00Z"
                Recipient="https://sp.example.com/acs"
                InResponseTo="_abc123"/>
            </saml2:SubjectConfirmation>
          </saml2:Subject>
          <saml2:Conditions NotBefore="2026-01-01T00:00:00Z" NotOnOrAfter="2026-01-01T00:05:00Z">
            <saml2:AudienceRestriction>
              <saml2:Audience>https://sp.example.com</saml2:Audience>
            </saml2:AudienceRestriction>
          </saml2:Conditions>
          <saml2:AuthnStatement AuthnInstant="2026-01-01T00:00:00Z" SessionIndex="_session123">
            <saml2:AuthnContext>
              <saml2:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:Password</saml2:AuthnContextClassRef>
            </saml2:AuthnContext>
          </saml2:AuthnStatement>
          <saml2:AttributeStatement>
            <saml2:Attribute Name="email">
              <saml2:AttributeValue>user@example.com</saml2:AttributeValue>
            </saml2:Attribute>
          </saml2:AttributeStatement>
        </saml2:Assertion>
      </saml2p:Response>
    `;

    const result = parseSamlpResponse(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    expect(result.$id).toBe("_resp123");
    expect(result.$inResponseTo).toBe("_abc123");
    expect(result.$version).toBe("2.0");

    expect(result.issuer).toBeDefined();
    expect(result.issuer).not.toBeInstanceOf(Error);
    if (!result.issuer || result.issuer instanceof Error) return;
    expect(result.issuer.$$content).toBe("https://idp.example.org");

    // Status
    expect(result.status).not.toBeInstanceOf(Error);
    if (result.status instanceof Error) return;
    expect(result.status.statusCode).not.toBeInstanceOf(Error);
    if (result.status.statusCode instanceof Error) return;
    expect(result.status.statusCode.$value).toBe("urn:oasis:names:tc:SAML:2.0:status:Success");

    // Assertion
    expect(result.assertions).toBeDefined();
    expect(result.assertions).not.toBeInstanceOf(Error);
    if (!result.assertions || result.assertions instanceof Error) return;
    expect(result.assertions.length).toBe(1);

    const assertion = result.assertions[0]!;
    expect(assertion.$id).toBe("_assert123");

    // Subject
    expect(assertion.subject).not.toBeInstanceOf(Error);
    if (!assertion.subject || assertion.subject instanceof Error) return;
    expect(assertion.subject.nameId).not.toBeInstanceOf(Error);
    if (assertion.subject.nameId instanceof Error) return;
    expect(assertion.subject.nameId?.$$content).toBe("user@example.com");
  });

  it("parses valid Response without namespace prefix", () => {
    const xml = `
      <Response ID="_resp456" Version="2.0" IssueInstant="2026-01-01T00:00:00Z">
        <Issuer>https://idp2.example.com</Issuer>
        <Status>
          <StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
        </Status>
      </Response>
    `;

    const result = parseSamlpResponse(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    expect(result.$id).toBe("_resp456");

    expect(result.issuer).toBeDefined();
    expect(result.issuer).not.toBeInstanceOf(Error);
    if (!result.issuer || result.issuer instanceof Error) return;
    expect(result.issuer.$$content).toBe("https://idp2.example.com");
  });

  it("returns Error when Response element is missing", () => {
    const xml = `<SomeOtherElement/>`;

    const result = parseSamlpResponse(xml);
    expect(result).toBeInstanceOf(Error);
    if (!(result instanceof Error)) return;
    expect(result.message).toBe("Response element not found");
  });

  it("parses Response with sub-status code", () => {
    const xml = `
      <samlp:Response
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        ID="_resp_fail"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:05Z">
        <samlp:Status>
          <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Responder">
            <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:AuthnFailed"/>
          </samlp:StatusCode>
        </samlp:Status>
      </samlp:Response>
    `;

    const result = parseSamlpResponse(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    expect(result.status).not.toBeInstanceOf(Error);
    if (result.status instanceof Error) return;
    expect(result.status.statusCode).not.toBeInstanceOf(Error);
    if (result.status.statusCode instanceof Error) return;
    expect(result.status.statusCode.$value).toBe("urn:oasis:names:tc:SAML:2.0:status:Responder");

    expect(result.status.statusCode.statusCode).toBeDefined();
    if (!result.status.statusCode.statusCode) return;
    expect(result.status.statusCode.statusCode.$value).toBe(
      "urn:oasis:names:tc:SAML:2.0:status:AuthnFailed",
    );
  });

  it("parses successful Response without sub-status code", () => {
    const xml = `
      <samlp:Response
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        ID="_resp_ok"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:05Z">
        <samlp:Status>
          <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
        </samlp:Status>
      </samlp:Response>
    `;

    const result = parseSamlpResponse(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    expect(result.status).not.toBeInstanceOf(Error);
    if (result.status instanceof Error) return;
    expect(result.status.statusCode).not.toBeInstanceOf(Error);
    if (result.status.statusCode instanceof Error) return;
    expect(result.status.statusCode.$value).toBe("urn:oasis:names:tc:SAML:2.0:status:Success");
    expect(result.status.statusCode.statusCode).toBeUndefined();
  });

  it("parses Assertion with ds:Signature", () => {
    const xml = `
      <samlp:Response
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
        ID="_resp_sig"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:05Z">
        <samlp:Status>
          <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
        </samlp:Status>
        <saml:Assertion Version="2.0" ID="_assert_sig" IssueInstant="2026-01-01T00:00:05Z">
          <saml:Issuer>https://idp.example.org</saml:Issuer>
          <ds:Signature>
            <ds:SignedInfo>
              <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
              <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
              <ds:Reference URI="#_assert_sig">
                <ds:Transforms>
                  <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
                  <ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
                </ds:Transforms>
                <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                <ds:DigestValue>abc123digest==</ds:DigestValue>
              </ds:Reference>
            </ds:SignedInfo>
            <ds:SignatureValue>sigvalue123==</ds:SignatureValue>
            <ds:KeyInfo>
              <ds:X509Data>
                <ds:X509Certificate>MIIC...</ds:X509Certificate>
              </ds:X509Data>
            </ds:KeyInfo>
          </ds:Signature>
        </saml:Assertion>
      </samlp:Response>
    `;

    const result = parseSamlpResponse(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    expect(result.assertions).not.toBeInstanceOf(Error);
    if (!result.assertions || result.assertions instanceof Error) return;
    const assertion = result.assertions[0]!;

    // Signature
    expect(assertion.signature).toBeDefined();
    expect(assertion.signature).not.toBeInstanceOf(Error);
    if (!assertion.signature || assertion.signature instanceof Error) return;

    // SignedInfo
    expect(assertion.signature.signedInfo).not.toBeInstanceOf(Error);
    if (assertion.signature.signedInfo instanceof Error) return;

    const signedInfo = assertion.signature.signedInfo;
    expect(signedInfo.canonicalizationMethod).not.toBeInstanceOf(Error);
    if (signedInfo.canonicalizationMethod instanceof Error) return;
    expect(signedInfo.canonicalizationMethod.$algorithm).toBe(
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    );

    expect(signedInfo.signatureMethod).not.toBeInstanceOf(Error);
    if (signedInfo.signatureMethod instanceof Error) return;
    expect(signedInfo.signatureMethod.$algorithm).toBe(
      "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    );

    // Reference
    expect(signedInfo.reference).not.toBeInstanceOf(Error);
    if (signedInfo.reference instanceof Error) return;
    expect(signedInfo.reference.$uri).toBe("#_assert_sig");

    // Transforms
    expect(signedInfo.reference.transforms).not.toBeInstanceOf(Error);
    if (!signedInfo.reference.transforms || signedInfo.reference.transforms instanceof Error)
      return;
    expect(signedInfo.reference.transforms).toHaveLength(2);
    expect(signedInfo.reference.transforms[0]!.$algorithm).toBe(
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
    );
    expect(signedInfo.reference.transforms[1]!.$algorithm).toBe(
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    );

    // DigestMethod / DigestValue
    expect(signedInfo.reference.digestMethod).not.toBeInstanceOf(Error);
    if (signedInfo.reference.digestMethod instanceof Error) return;
    expect(signedInfo.reference.digestMethod.$algorithm).toBe(
      "http://www.w3.org/2001/04/xmlenc#sha256",
    );
    expect(signedInfo.reference.digestValue).not.toBeInstanceOf(Error);
    if (signedInfo.reference.digestValue instanceof Error) return;
    expect(signedInfo.reference.digestValue.$$content).toBe("abc123digest==");

    // SignatureValue
    expect(assertion.signature.signatureValue).not.toBeInstanceOf(Error);
    if (assertion.signature.signatureValue instanceof Error) return;
    expect(assertion.signature.signatureValue.$$content).toBe("sigvalue123==");

    // KeyInfo / X509Data
    expect(assertion.signature.keyInfo).not.toBeInstanceOf(Error);
    if (!assertion.signature.keyInfo || assertion.signature.keyInfo instanceof Error) return;
    expect(assertion.signature.keyInfo.x509Data).not.toBeInstanceOf(Error);
    if (
      !assertion.signature.keyInfo.x509Data ||
      assertion.signature.keyInfo.x509Data instanceof Error
    )
      return;
    expect(assertion.signature.keyInfo.x509Data.x509Certificate).not.toBeInstanceOf(Error);
    if (
      !assertion.signature.keyInfo.x509Data.x509Certificate ||
      assertion.signature.keyInfo.x509Data.x509Certificate instanceof Error
    )
      return;
    expect(assertion.signature.keyInfo.x509Data.x509Certificate.$$content).toBe("MIIC...");
  });

  it("parses Assertion with dsig:Signature namespace prefix", () => {
    const xml = `
      <samlp:Response
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        xmlns:dsig="http://www.w3.org/2000/09/xmldsig#"
        ID="_resp_sig2"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:05Z">
        <samlp:Status>
          <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
        </samlp:Status>
        <saml:Assertion Version="2.0" ID="_assert_sig2" IssueInstant="2026-01-01T00:00:05Z">
          <saml:Issuer>https://idp.example.org</saml:Issuer>
          <dsig:Signature>
            <dsig:SignedInfo>
              <dsig:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
              <dsig:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
              <dsig:Reference URI="#_assert_sig2">
                <dsig:Transforms>
                  <dsig:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
                </dsig:Transforms>
                <dsig:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                <dsig:DigestValue>abc123digest==</dsig:DigestValue>
              </dsig:Reference>
            </dsig:SignedInfo>
            <dsig:SignatureValue>sigvalue123==</dsig:SignatureValue>
            <dsig:KeyInfo>
              <dsig:X509Data>
                <dsig:X509Certificate>MIIC...</dsig:X509Certificate>
              </dsig:X509Data>
            </dsig:KeyInfo>
          </dsig:Signature>
        </saml:Assertion>
      </samlp:Response>
    `;

    const result = parseSamlpResponse(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    expect(result.assertions).not.toBeInstanceOf(Error);
    if (!result.assertions || result.assertions instanceof Error) return;
    const assertion = result.assertions[0]!;

    expect(assertion.signature).toBeDefined();
    expect(assertion.signature).not.toBeInstanceOf(Error);
    if (!assertion.signature || assertion.signature instanceof Error) return;

    expect(assertion.signature.signedInfo).not.toBeInstanceOf(Error);
    if (assertion.signature.signedInfo instanceof Error) return;
    expect(assertion.signature.signedInfo.canonicalizationMethod).not.toBeInstanceOf(Error);

    expect(assertion.signature.signatureValue).not.toBeInstanceOf(Error);
    if (assertion.signature.signatureValue instanceof Error) return;
    expect(assertion.signature.signatureValue.$$content).toBe("sigvalue123==");

    expect(assertion.signature.keyInfo).not.toBeInstanceOf(Error);
    if (!assertion.signature.keyInfo || assertion.signature.keyInfo instanceof Error) return;
    expect(assertion.signature.keyInfo.x509Data).not.toBeInstanceOf(Error);
  });

  it("returns Error in status when Status element is missing", () => {
    const xml = `
      <samlp:Response ID="_resp789" Version="2.0" IssueInstant="2026-01-01T00:00:00Z">
      </samlp:Response>
    `;

    const result = parseSamlpResponse(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    expect(result.status).toBeInstanceOf(Error);
  });

  it("parses Attribute with NameFormat and FriendlyName", () => {
    const xml = `
      <samlp:Response
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        ID="_resp_attr"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:05Z">
        <samlp:Status>
          <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
        </samlp:Status>
        <saml:Assertion Version="2.0" ID="_assert_attr" IssueInstant="2026-01-01T00:00:05Z">
          <saml:Issuer>https://idp.example.org</saml:Issuer>
          <saml:AttributeStatement>
            <saml:Attribute
              Name="urn:oid:0.9.2342.19200300.100.1.3"
              NameFormat="urn:oasis:names:tc:SAML:2.0:attrname-format:uri"
              FriendlyName="mail">
              <saml:AttributeValue>user@example.com</saml:AttributeValue>
            </saml:Attribute>
          </saml:AttributeStatement>
        </saml:Assertion>
      </samlp:Response>
    `;

    const result = parseSamlpResponse(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    if (!result.assertions || result.assertions instanceof Error) return;
    const assertion = result.assertions[0]!;
    if (!assertion.attributeStatements || assertion.attributeStatements instanceof Error) return;
    const attrStmt = assertion.attributeStatements[0]!;
    if (attrStmt.attributes instanceof Error) return;

    const attr = attrStmt.attributes[0]!;
    expect(attr.$name).toBe("urn:oid:0.9.2342.19200300.100.1.3");
    expect(attr.$nameFormat).toBe("urn:oasis:names:tc:SAML:2.0:attrname-format:uri");
    expect(attr.$friendlyName).toBe("mail");
  });

  it("parses AttributeValue with xsi:type", () => {
    const xml = `
      <samlp:Response
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        xmlns:xs="http://www.w3.org/2001/XMLSchema"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        ID="_resp_xsi"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:05Z">
        <samlp:Status>
          <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
        </samlp:Status>
        <saml:Assertion Version="2.0" ID="_assert_xsi" IssueInstant="2026-01-01T00:00:05Z">
          <saml:Issuer>https://idp.example.org</saml:Issuer>
          <saml:AttributeStatement>
            <saml:Attribute Name="email">
              <saml:AttributeValue xsi:type="xs:string">user@example.com</saml:AttributeValue>
            </saml:Attribute>
          </saml:AttributeStatement>
        </saml:Assertion>
      </samlp:Response>
    `;

    const result = parseSamlpResponse(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    if (!result.assertions || result.assertions instanceof Error) return;
    const assertion = result.assertions[0]!;
    if (!assertion.attributeStatements || assertion.attributeStatements instanceof Error) return;
    const attrStmt = assertion.attributeStatements[0]!;
    if (attrStmt.attributes instanceof Error) return;

    const attr = attrStmt.attributes[0]!;
    if (!attr.attributeValues || attr.attributeValues instanceof Error) return;
    const value = attr.attributeValues[0]!;
    expect(value.$$content).toBe("user@example.com");
    expect(value.$xsiType).toBe("xs:string");
  });

  it("parses AuthnStatement with SessionNotOnOrAfter", () => {
    const xml = `
      <samlp:Response
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        ID="_resp_sna"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:05Z">
        <samlp:Status>
          <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
        </samlp:Status>
        <saml:Assertion Version="2.0" ID="_assert_sna" IssueInstant="2026-01-01T00:00:05Z">
          <saml:Issuer>https://idp.example.org</saml:Issuer>
          <saml:AuthnStatement
            AuthnInstant="2026-01-01T00:00:00Z"
            SessionIndex="_session123"
            SessionNotOnOrAfter="2026-01-01T08:00:00Z">
            <saml:AuthnContext>
              <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:Password</saml:AuthnContextClassRef>
            </saml:AuthnContext>
          </saml:AuthnStatement>
        </saml:Assertion>
      </samlp:Response>
    `;

    const result = parseSamlpResponse(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    if (!result.assertions || result.assertions instanceof Error) return;
    const assertion = result.assertions[0]!;
    if (!assertion.authnStatements || assertion.authnStatements instanceof Error) return;
    const stmt = assertion.authnStatements[0]!;
    expect(stmt.$sessionIndex).toBe("_session123");
    expect(stmt.$sessionNotOnOrAfter).toBe("2026-01-01T08:00:00Z");
  });

  it("keeps numeric and boolean AttributeValue content as strings", () => {
    const xml = `
      <samlp:Response
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        ID="_resp_num"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:05Z">
        <samlp:Status>
          <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
        </samlp:Status>
        <saml:Assertion Version="2.0" ID="_assert_num" IssueInstant="2026-01-01T00:00:05Z">
          <saml:Issuer>https://idp.example.org</saml:Issuer>
          <saml:AttributeStatement>
            <saml:Attribute Name="age">
              <saml:AttributeValue>42</saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="active">
              <saml:AttributeValue>true</saml:AttributeValue>
            </saml:Attribute>
            <saml:Attribute Name="zero">
              <saml:AttributeValue>0</saml:AttributeValue>
            </saml:Attribute>
          </saml:AttributeStatement>
        </saml:Assertion>
      </samlp:Response>
    `;

    const result = parseSamlpResponse(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    if (!result.assertions || result.assertions instanceof Error) return;
    const assertion = result.assertions[0]!;
    if (!assertion.attributeStatements || assertion.attributeStatements instanceof Error) return;
    const attrStmt = assertion.attributeStatements[0]!;
    if (attrStmt.attributes instanceof Error) return;

    const [age, active, zero] = attrStmt.attributes;
    if (!age?.attributeValues || age.attributeValues instanceof Error) return;
    if (!active?.attributeValues || active.attributeValues instanceof Error) return;
    if (!zero?.attributeValues || zero.attributeValues instanceof Error) return;

    expect(age.attributeValues[0]!.$$content).toBe("42");
    expect(active.attributeValues[0]!.$$content).toBe("true");
    expect(zero.attributeValues[0]!.$$content).toBe("0");
  });

  it("parses KeyInfo with KeyName", () => {
    const xml = `
      <samlp:Response
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
        ID="_resp_kn"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:05Z">
        <samlp:Status>
          <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
        </samlp:Status>
        <saml:Assertion Version="2.0" ID="_assert_kn" IssueInstant="2026-01-01T00:00:05Z">
          <saml:Issuer>https://idp.example.org</saml:Issuer>
          <ds:Signature>
            <ds:SignedInfo>
              <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
              <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
              <ds:Reference URI="#_assert_kn">
                <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                <ds:DigestValue>abc==</ds:DigestValue>
              </ds:Reference>
            </ds:SignedInfo>
            <ds:SignatureValue>sigvalue==</ds:SignatureValue>
            <ds:KeyInfo>
              <ds:KeyName>my-signing-key</ds:KeyName>
              <ds:X509Data>
                <ds:X509Certificate>MIIC...</ds:X509Certificate>
              </ds:X509Data>
            </ds:KeyInfo>
          </ds:Signature>
        </saml:Assertion>
      </samlp:Response>
    `;

    const result = parseSamlpResponse(xml);
    expect(result).not.toBeInstanceOf(Error);
    if (result instanceof Error) return;

    if (!result.assertions || result.assertions instanceof Error) return;
    const assertion = result.assertions[0]!;
    if (!assertion.signature || assertion.signature instanceof Error) return;
    if (!assertion.signature.keyInfo || assertion.signature.keyInfo instanceof Error) return;

    expect(assertion.signature.keyInfo.keyName).not.toBeInstanceOf(Error);
    if (
      !assertion.signature.keyInfo.keyName ||
      assertion.signature.keyInfo.keyName instanceof Error
    )
      return;
    expect(assertion.signature.keyInfo.keyName.$$content).toBe("my-signing-key");
  });
});
