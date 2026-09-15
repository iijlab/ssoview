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
      step: 3;
      correlationKey: string;
    }
  | {
      step: 5;
      correlationKey: string;
      samlStatusCode: string;
    };

export type SamlSignalFromHttpResponse =
  | {
      step: 2;
      correlationKey: string;
    }
  | {
      step: 4;
      correlationKey: string;
      samlStatusCode: string;
    }
  | {
      step: 6;
      correlationKey: string;
    };

export type InferredSamlSignal = {
  step: 1;
  correlationKey: string;
};
