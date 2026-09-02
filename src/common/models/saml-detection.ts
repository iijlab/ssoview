/**
 * @copyright Internet Initiative Japan Inc. All rights reserved.
 * @license BSD-3-Clause
 */

export type SamlDetection =
  | InferredSamlDetection
  | SamlDetectionFromHttpRequest
  | SamlDetectionFromHttpResponse;

export type InferredSamlDetection = {
  step: 1;
  correlationKey: string;
};

export type SamlDetectionFromHttpRequest =
  | {
      step: 3;
      correlationKey: string;
    }
  | {
      step: 5;
      correlationKey: string;
      samlStatusCode: string;
    };

export type SamlDetectionFromHttpResponse =
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
