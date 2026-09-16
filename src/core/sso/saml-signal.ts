/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

export type SamlSignal =
  | SamlSignalFromHttpRequest
  | SamlSignalFromHttpResponse
  | InferredSamlSignal;

export type SamlSignalFromHttpRequest =
  | {
      type: "OutgoingSamlAuthnRequest";
      correlationKey: string;
    }
  | {
      type: "OutgoingSamlResponse";
      correlationKey: string;
      samlStatusCode: string;
    };

export type SamlSignalFromHttpResponse =
  | {
      type: "IncomingSamlAuthnRequest";
      correlationKey: string;
    }
  | {
      type: "IncomingSamlResponse";
      correlationKey: string;
      samlStatusCode: string;
    }
  | {
      type: "AuthenticatedResourceResponse";
      correlationKey: string;
    };

export type InferredSamlSignal = {
  type: "UnauthenticatedResourceRequest";
  correlationKey: string;
};
