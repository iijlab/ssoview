/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

import { describe, expect, it } from "vitest";
import type { HttpMessage } from "@/common/models/http-message.ts";
import type { SessionSummary } from "@/common/models/session-summary.ts";
import {
  buildAuthnRequestDetails,
  buildHttpMessageDetails,
  buildResponseDetails,
  buildSessionData,
  buildSessionResult,
} from "./content-builders.ts";

//
// Helpers
//

function makeSessionSummary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    protocol: "saml",
    imported: false,
    capturing: false,
    sessionId: "session-1",
    warning: [],
    ...overrides,
  };
}

const sampleAuthnRequestXml = `
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                    ID="identifier_1"
                    Version="2.0"
                    IssueInstant="2004-12-05T09:21:59Z"
                    ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                    AssertionConsumerServiceURL="https://sp.example.com/SAML2/SSO/POST"
                    ProviderName="My Service"
                    Destination="https://idp.example.org/SAML2/SSO/Redirect">
  <saml:Issuer>https://sp.example.com/SAML2</saml:Issuer>
  <samlp:NameIDPolicy AllowCreate="true"
                      Format="urn:oasis:names:tc:SAML:2.0:nameid-format:transient"/>
</samlp:AuthnRequest>
`.trim();

const sampleResponseXml = `
<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                ID="identifier_2"
                InResponseTo="identifier_1"
                Version="2.0"
                IssueInstant="2004-12-05T09:22:05Z"
                Destination="https://sp.example.com/SAML2/SSO/POST">
  <saml:Issuer>https://idp.example.org/SAML2</saml:Issuer>
  <samlp:Status>
    <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
  </samlp:Status>
  <saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                  ID="identifier_3"
                  Version="2.0"
                  IssueInstant="2004-12-05T09:22:05Z">
    <saml:Issuer>https://idp.example.org/SAML2</saml:Issuer>
    <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
      <ds:SignedInfo>
        <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
        <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"/>
        <ds:Reference URI="#identifier_3">
          <ds:Transforms>
            <ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
            <ds:Transform Algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"/>
          </ds:Transforms>
          <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
          <ds:DigestValue>J/IW/jR0Ofzqcg4l0kf2bLifCn5C8Aj5mlqV3ELsHeU=</ds:DigestValue>
        </ds:Reference>
      </ds:SignedInfo>
      <ds:SignatureValue>nlBSVEsKGfuKTRRwzFcumtUxA9hQEaTgEHzRaeQTZE1ZphvQIm+OAd0LdlYBjHSYcKnhq1HaoPendbsuc3o+2KLaQfdf+HyqDWY3Fe7EE6fpGq0f086vkGC+mOI6+54dRhNJKnYedXW6KFMZlsY74xLr66TRtQXFiBVQaaiO+Y/Pk9xlEKUUjjId/x671r9+3gkRELudynf3WGqvbs361ausgz3QVlCNi4syH/LgViXOpR0n6yenz+QC0G2a3C4sFseg7Lx5LHMg0Y9xk7Qk1N++yf+7kNajIDtjq0XSXbYnBzgZW/RsYXTMtZVQf49c2+3HdQb/jGwATmcq5MAkKA==</ds:SignatureValue>
      <ds:KeyInfo>
        <ds:KeyName>my-signing-key</ds:KeyName>
        <ds:X509Data>
          <ds:X509Certificate>MIIDFTCCAf2gAwIBAgIUGYcGKbsf6+m08mThOLj59WThhiQwDQYJKoZIhvcNAQELBQAwGjEYMBYGA1UEAwwPaWRwLmV4YW1wbGUub3JnMB4XDTI2MDUyOTA2MTM0MVoXDTI5MDUyODA2MTM0MVowGjEYMBYGA1UEAwwPaWRwLmV4YW1wbGUub3JnMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApTn9Q9HuDb5A1nF+Z0z1NY+dlmeYoZZnhXtvzuUPYsvpnp4+X+7BbRxEltMz7KOkhDCR/K5dDlBxS9hHldlxH5tju5Vu3c+x4iWhbSRKWkGSXSNW72XAkNzbJACmJ4dBPKsh+CDvj0JKvJuj+ONBQpMJkxUTUXZyXauL3rDZ6qXUJw3HSvcmzUR6HgHK08b/exg6x2YzprU3u4ogU4/snJrfoQEWOBcSW9/w+zutihnisBpLis/Vaydx5MYoqThulLFc8GLQGrnOtSpAMzDxkFgNWPtWLINbSrbqWUd1qoB9I2EJBVtWCExODE5gEe+H/Z4OHBxWsc8ThIYRYxwSyQIDAQABo1MwUTAdBgNVHQ4EFgQUovOstcXogUkQpF3YsvaI+pBLd18wHwYDVR0jBBgwFoAUovOstcXogUkQpF3YsvaI+pBLd18wDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEANWqSTPYT1GaTr0UU5XDodj753jLyRTuh66cNgtYXxAq2V6G/JlIvZa90u1omI/ZCc6kI76YGd1U3lfCZSWjzyrieoqJQSIWy7EfrdTiQjszCMIibow6l/oi3cmoYn+hTwI0zf2xyZzYOTU0BrHUPc43Hiog9bTcEQt2gE5Cks+RXZt1+vGPFumkrVdcc5I29gwThJHKdq22rMqb+u7Vmn7MsoBnVirwLyZcuaZ29WbKVDZ852HbzDJI8B/4QvJ52Kff6JriCXhFPWjjs54giSpdavSB2f1ucD3XxD2p3Q44UmVP3/Putlu4COmCiLcUD0b9yOYe3NooNFg0IDvHgUQ==</ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </ds:Signature>
    <saml:Subject>
      <saml:NameID Format="urn:oasis:names:tc:SAML:2.0:nameid-format:transient">
        3f7b3dcf-1674-4ecd-92c8-1544f346baf8
      </saml:NameID>
      <saml:SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer">
        <saml:SubjectConfirmationData InResponseTo="identifier_1"
                                      Recipient="https://sp.example.com/SAML2/SSO/POST"
                                      NotOnOrAfter="2004-12-05T09:27:05Z"/>
      </saml:SubjectConfirmation>
    </saml:Subject>
    <saml:Conditions NotBefore="2004-12-05T09:17:05Z"
                     NotOnOrAfter="2004-12-05T09:27:05Z">
      <saml:AudienceRestriction>
        <saml:Audience>https://sp.example.com/SAML2</saml:Audience>
      </saml:AudienceRestriction>
    </saml:Conditions>
    <saml:AuthnStatement AuthnInstant="2004-12-05T09:22:00Z"
                         SessionIndex="identifier_3"
                         SessionNotOnOrAfter="2004-12-05T17:22:05Z">
      <saml:AuthnContext>
        <saml:AuthnContextClassRef>
          urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport
        </saml:AuthnContextClassRef>
      </saml:AuthnContext>
    </saml:AuthnStatement>
    <saml:AttributeStatement>
      <saml:Attribute Name="http://schemas.example.org/claims/displayname">
        <saml:AttributeValue>Foo Bar</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="http://schemas.example.org/claims/emailaddress">
        <saml:AttributeValue>foo@example.com</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="http://schemas.example.org/claims/givenname">
        <saml:AttributeValue>Foo</saml:AttributeValue>
      </saml:Attribute>
      <saml:Attribute Name="http://schemas.example.org/claims/surname">
        <saml:AttributeValue>Bar</saml:AttributeValue>
      </saml:Attribute>
    </saml:AttributeStatement>
  </saml:Assertion>
</samlp:Response>
`.trim();

//
// Tests
//

describe("buildSessionData", () => {
  it("maps sessionSummary fields", () => {
    const summary = makeSessionSummary({
      sessionId: "ses-abc",
      start: "2026-01-01T00:00:00Z",
      end: "2026-01-01T00:01:00Z",
      sp: "sp.example.com",
      idp: "idp.example.org",
    });

    const result = buildSessionData(summary);

    expect(result.sessionId).toBe("ses-abc");
    expect(result.sessionStartTime).toBe("2026-01-01T00:00:00Z");
    expect(result.sessionEndTime).toBe("2026-01-01T00:01:00Z");
    expect(result.serviceProvider).toBe("sp.example.com");
    expect(result.identityProvider).toBe("idp.example.org");
  });

  it("falls back to N/A when sessionSummary optional fields are missing", () => {
    const summary = makeSessionSummary();

    const result = buildSessionData(summary);

    expect(result.sessionStartTime).toBe("N/A");
    expect(result.sessionEndTime).toBe("N/A");
    expect(result.serviceProvider).toBe("N/A");
    expect(result.identityProvider).toBe("N/A");
  });

  it("falls back to N/A for XML-derived fields when no XML is provided", () => {
    const result = buildSessionData(makeSessionSummary());

    expect(result.samlVersion).toBe("N/A");
    expect(result.protocolBinding).toBe("N/A");
    expect(result.userId).toBe("N/A");
    expect(result.authenticationMethod).toBe("N/A");
  });

  it("extracts samlVersion and protocolBinding from authnRequestXml", () => {
    const result = buildSessionData(makeSessionSummary(), sampleAuthnRequestXml);

    expect(result.samlVersion).toBe("2.0");
    expect(result.protocolBinding).toBe("urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST");
  });

  it("extracts userId from responseXml", () => {
    const result = buildSessionData(makeSessionSummary(), undefined, sampleResponseXml);

    expect(result.userId).toBe("3f7b3dcf-1674-4ecd-92c8-1544f346baf8");
  });

  it("extracts authenticationMethod from responseXml", () => {
    const result = buildSessionData(makeSessionSummary(), undefined, sampleResponseXml);

    expect(result.authenticationMethod).toBe(
      "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
    );
  });

  it("always sets samlProfile to fixed value", () => {
    const result = buildSessionData(makeSessionSummary());

    expect(result.samlProfile).toBe("Web Browser SSO Profile");
  });

  it("falls back to N/A for invalid XML", () => {
    const result = buildSessionData(makeSessionSummary(), "<not-valid-xml>", "<not-valid-xml>");

    expect(result.samlVersion).toBe("N/A");
    expect(result.protocolBinding).toBe("N/A");
    expect(result.userId).toBe("N/A");
    expect(result.authenticationMethod).toBe("N/A");
  });
});

describe("buildSessionResult", () => {
  it("returns Unknown when no responseXml is provided", () => {
    const result = buildSessionResult(makeSessionSummary());

    expect(result.status).toBe("Unknown");
    expect(result.description).toBe("SAML Response was not captured.");
  });

  it("returns Success when StatusCode is Success", () => {
    const responseXml = `
      <samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        ID="_r1" Version="2.0" IssueInstant="2026-01-01T00:00:00Z">
        <samlp:Status>
          <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/>
        </samlp:Status>
      </samlp:Response>
    `;

    const result = buildSessionResult(makeSessionSummary(), undefined, responseXml);

    expect(result.status).toBe("Success");
    expect(result.description).toContain("successfully");
  });

  it("returns combined status with sub-status code when StatusCode is not Success", () => {
    const responseXml = `
      <samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        ID="_r2" Version="2.0" IssueInstant="2026-01-01T00:00:00Z">
        <samlp:Status>
          <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Responder">
            <samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:AuthnFailed"/>
          </samlp:StatusCode>
        </samlp:Status>
      </samlp:Response>
    `;

    const result = buildSessionResult(makeSessionSummary(), undefined, responseXml);

    expect(result.status).toBe("Responder:AuthnFailed");
    expect(result.description).toContain("SAML responder");
    expect(result.description).toContain("authenticate the principal");
  });

  it("returns Unknown when responseXml is invalid", () => {
    const result = buildSessionResult(makeSessionSummary(), undefined, "<not-valid>");

    expect(result.status).toBe("Unknown");
  });
});

describe("buildAuthnRequestDetails", () => {
  it("returns undefined for invalid XML", () => {
    expect(buildAuthnRequestDetails("<not-authn-request>")).toBeUndefined();
  });

  it("returns rawXml as-is", () => {
    const result = buildAuthnRequestDetails(sampleAuthnRequestXml);

    expect(result?.rawXml).toBe(sampleAuthnRequestXml);
  });

  it("builds AuthnRequest section with expected fields", () => {
    const result = buildAuthnRequestDetails(sampleAuthnRequestXml);
    const section = findSection(result?.sections, "AuthnRequest");

    expect(findField(section, "ID")).toBe("identifier_1");
    expect(findField(section, "Version")).toBe("2.0");
    expect(findField(section, "IssueInstant")).toBe("2004-12-05T09:21:59Z");
    expect(findField(section, "ProtocolBinding")).toBe(
      "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
    );
    expect(findField(section, "Destination")).toBe("https://idp.example.org/SAML2/SSO/Redirect");
    expect(findField(section, "AssertionConsumerServiceURL")).toBe(
      "https://sp.example.com/SAML2/SSO/POST",
    );
    expect(findField(section, "ProviderName")).toBe("My Service");
  });

  it("includes ForceAuthn and IsPassive fields when present", () => {
    const xml = `
      <samlp:AuthnRequest
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        ID="_req1"
        Version="2.0"
        IssueInstant="2026-01-01T00:00:00Z"
        ForceAuthn="true"
        IsPassive="false">
      </samlp:AuthnRequest>
    `;
    const result = buildAuthnRequestDetails(xml);
    const section = findSection(result?.sections, "AuthnRequest");

    expect(findField(section, "ForceAuthn")).toBe("true");
    expect(findField(section, "IsPassive")).toBe("false");
  });

  it("omits ForceAuthn and IsPassive fields when not present", () => {
    const result = buildAuthnRequestDetails(sampleAuthnRequestXml);
    const section = findSection(result?.sections, "AuthnRequest");

    expect(findField(section, "ForceAuthn")).toBeUndefined();
    expect(findField(section, "IsPassive")).toBeUndefined();
  });

  it("builds Issuer section", () => {
    const result = buildAuthnRequestDetails(sampleAuthnRequestXml);
    const section = findSection(result?.sections, "Issuer");

    expect(findField(section, "Issuer")).toBe("https://sp.example.com/SAML2");
  });

  it("builds NameIDPolicy section", () => {
    const result = buildAuthnRequestDetails(sampleAuthnRequestXml);
    const section = findSection(result?.sections, "NameIDPolicy");

    expect(findField(section, "Format")).toBe(
      "urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
    );
    expect(findField(section, "AllowCreate")).toBe("true");
  });

  it("builds Conditions section when present", () => {
    const xml = `
      <samlp:AuthnRequest
        xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
        xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
        ID="_req1"
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
    const result = buildAuthnRequestDetails(xml);
    const section = findSection(result?.sections, "Conditions");

    expect(findField(section, "NotBefore")).toBe("2026-01-01T00:00:00Z");
    expect(findField(section, "NotOnOrAfter")).toBe("2026-01-01T00:05:00Z");
    expect(findField(section, "Audience")).toBe("https://sp.example.com");
  });

  it("omits Conditions section when not present", () => {
    const result = buildAuthnRequestDetails(sampleAuthnRequestXml);
    const section = findSection(result?.sections, "Conditions");

    expect(section).toBeUndefined();
  });
});

describe("buildResponseDetails", () => {
  it("returns undefined for invalid XML", () => {
    expect(buildResponseDetails("<not-a-response>")).toBeUndefined();
  });

  it("returns rawXml as-is", () => {
    const result = buildResponseDetails(sampleResponseXml);

    expect(result?.rawXml).toBe(sampleResponseXml);
  });

  it("builds Response section with expected fields", () => {
    const result = buildResponseDetails(sampleResponseXml);
    const section = findSection(result?.sections, "Response");

    expect(findField(section, "ID")).toBe("identifier_2");
    expect(findField(section, "Version")).toBe("2.0");
    expect(findField(section, "IssueInstant")).toBe("2004-12-05T09:22:05Z");
    expect(findField(section, "Destination")).toBe("https://sp.example.com/SAML2/SSO/POST");
    expect(findField(section, "InResponseTo")).toBe("identifier_1");
    expect(findField(section, "Issuer")).toBe("https://idp.example.org/SAML2");
  });

  it("builds Status section", () => {
    const result = buildResponseDetails(sampleResponseXml);
    const section = findSection(result?.sections, "Status");

    expect(findField(section, "StatusCode")).toBe("urn:oasis:names:tc:SAML:2.0:status:Success");
  });

  it("builds Subject section", () => {
    const result = buildResponseDetails(sampleResponseXml);
    const section = findSection(result?.sections, "Subject");

    expect(findField(section, "NameID")).toBe("3f7b3dcf-1674-4ecd-92c8-1544f346baf8");
    expect(findField(section, "NameID Format")).toBe(
      "urn:oasis:names:tc:SAML:2.0:nameid-format:transient",
    );
    expect(findField(section, "SubjectConfirmation Method")).toBe(
      "urn:oasis:names:tc:SAML:2.0:cm:bearer",
    );
    expect(findField(section, "SubjectConfirmationData InResponseTo")).toBe("identifier_1");
    expect(findField(section, "SubjectConfirmationData NotOnOrAfter")).toBe("2004-12-05T09:27:05Z");
    expect(findField(section, "SubjectConfirmationData Recipient")).toBe(
      "https://sp.example.com/SAML2/SSO/POST",
    );
  });

  it("builds Assertion section", () => {
    const result = buildResponseDetails(sampleResponseXml);
    const section = findSection(result?.sections, "Assertion");

    expect(findField(section, "ID")).toBe("identifier_3");
    expect(findField(section, "IssueInstant")).toBe("2004-12-05T09:22:05Z");
    expect(findField(section, "Version")).toBe("2.0");
    expect(findField(section, "Issuer")).toBe("https://idp.example.org/SAML2");
  });

  it("builds Assertion Signature section", () => {
    const result = buildResponseDetails(sampleResponseXml);
    const section = findSection(result?.sections, "Assertion Signature");

    expect(findField(section, "CanonicalizationMethod")).toBe(
      "http://www.w3.org/2001/10/xml-exc-c14n#",
    );
    expect(findField(section, "SignatureMethod")).toBe(
      "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    );
    expect(findField(section, "Reference URI")).toBe("#identifier_3");
    expect(section?.fields.filter((f) => f.name === "Transform")).toHaveLength(2);
    expect(findField(section, "DigestMethod")).toBe("http://www.w3.org/2001/04/xmlenc#sha256");
    expect(findField(section, "DigestValue")).toBe("J/IW/jR0Ofzqcg4l0kf2bLifCn5C8Aj5mlqV3ELsHeU=");
    expect(findField(section, "SignatureValue")).toContain("nlBSVEsK");
    expect(findField(section, "KeyName")).toBe("my-signing-key");
    expect(findField(section, "X509Certificate")).toContain("MIIDFTCC");
  });

  it("builds Conditions section", () => {
    const result = buildResponseDetails(sampleResponseXml);
    const section = findSection(result?.sections, "Conditions");

    expect(findField(section, "NotBefore")).toBe("2004-12-05T09:17:05Z");
    expect(findField(section, "NotOnOrAfter")).toBe("2004-12-05T09:27:05Z");
    expect(findField(section, "Audience")).toBe("https://sp.example.com/SAML2");
  });

  it("builds AuthnStatement section", () => {
    const result = buildResponseDetails(sampleResponseXml);
    const section = findSection(result?.sections, "AuthnStatement");

    expect(findField(section, "AuthnInstant")).toBe("2004-12-05T09:22:00Z");
    expect(findField(section, "SessionIndex")).toBe("identifier_3");
    expect(findField(section, "SessionNotOnOrAfter")).toBe("2004-12-05T17:22:05Z");
    expect(findField(section, "AuthnContextClassRef")).toBe(
      "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport",
    );
  });

  it("builds AttributeStatement section", () => {
    const result = buildResponseDetails(sampleResponseXml);
    const section = findSection(result?.sections, "AttributeStatement");

    expect(findField(section, "displayname")).toBe("Foo Bar");
    expect(findField(section, "emailaddress")).toBe("foo@example.com");
    expect(findField(section, "givenname")).toBe("Foo");
    expect(findField(section, "surname")).toBe("Bar");
  });
});

describe("buildHttpMessageDetails", () => {
  const baseFields = {
    createdAt: "2026-01-01T00:00:00Z",
    imported: false,
    requestId: "req-1",
    resourceType: "Document",
    url: "https://example.com/path",
    method: "POST",
    headers: [{ name: "Content-Type", value: "text/html" }],
  };

  it("builds request details from a loaded HTTP request", () => {
    const httpMessage = {
      ...baseFields,
      stage: "Request",
      bodyStatus: "loaded",
      body: "request body",
    } as HttpMessage;

    const result = buildHttpMessageDetails(httpMessage);

    expect(result.kind).toBe("request");
    expect(result.headers).toEqual([{ name: "Content-Type", value: "text/html" }]);
    expect(result.body).toBe("request body");
    if (result.kind !== "request") return;
    expect(result.method).toBe("POST");
    expect(result.url).toBe("https://example.com/path");
  });

  it("builds response details from a loaded HTTP response", () => {
    const httpMessage = {
      ...baseFields,
      stage: "Response",
      statusCode: 200,
      bodyStatus: "loaded",
      body: "response body",
    } as HttpMessage;

    const result = buildHttpMessageDetails(httpMessage);

    expect(result.kind).toBe("response");
    expect(result.headers).toEqual([{ name: "Content-Type", value: "text/html" }]);
    expect(result.body).toBe("response body");
    if (result.kind !== "response") return;
    expect(result.statusCode).toBe(200);
    expect(result.statusText).toBe("OK");
    expect(result.requestMethod).toBe("POST");
    expect(result.requestUrl).toBe("https://example.com/path");
  });

  it("sets body to empty string when bodyStatus is not loaded", () => {
    const httpMessage = {
      ...baseFields,
      stage: "Request",
      bodyStatus: "pending",
      getBody: () => Promise.resolve(""),
    } as HttpMessage;

    const result = buildHttpMessageDetails(httpMessage);

    expect(result.body).toBe("");
  });

  it("maps statusCode to statusText", () => {
    const httpMessage = {
      ...baseFields,
      stage: "Response",
      statusCode: 302,
      bodyStatus: "loaded",
      body: "",
    } as HttpMessage;

    const result = buildHttpMessageDetails(httpMessage);

    if (result.kind !== "response") return;
    expect(result.statusCode).toBe(302);
    expect(result.statusText).toBe("Found");
  });
});

//
// Test helpers
//

type Section = { title: string; fields: { name: string; value: string }[] };

function findSection(sections: Section[] | undefined, title: string): Section | undefined {
  return sections?.find((s) => s.title === title);
}

function findField(section: Section | undefined, name: string): string | undefined {
  return section?.fields.find((f) => f.name === name)?.value;
}
