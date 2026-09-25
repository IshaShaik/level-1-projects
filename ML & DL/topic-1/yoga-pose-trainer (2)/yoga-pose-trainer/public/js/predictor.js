// predictor.js
// Runs the trained TensorFlow.js model against a single normalized landmark
// feature vector and returns real probabilities for every class — never a
// randomly-generated or hard-coded confidence value.

import { FEATURE_LENGTH } from './poseDetector.js';

export const CONFIDENCE_THRESHOLD = 0.6;

/**
 * model: a trained tf.LayersModel
 * classNames: string[] in the same order the model was trained with
 * normalizedFeatures: number[99] from poseDetector.normalizeLandmarks
 *
 * Returns:
 * {
 *   label: string | null,       // null when below threshold ("unknown")
 *   confidence: number,         // 0..1, for the top class
 *   isUnknown: boolean,
 *   probabilities: [{ name, prob }]  // every class, for the confidence bars
 * }
 */
export function predict(model, classNames, normalizedFeatures) {
  const probsArray = tf.tidy(() => {
    const input = tf.tensor2d([normalizedFeatures], [1, FEATURE_LENGTH]);
    const output = model.predict(input);
    return output.dataSync();
  });

  const probabilities = classNames.map((name, i) => ({ name, prob: probsArray[i] }));
  probabilities.sort((a, b) => b.prob - a.prob);

  const top = probabilities[0];
  const isUnknown = !top || top.prob < CONFIDENCE_THRESHOLD;

  return {
    label: isUnknown ? null : top.name,
    confidence: top ? top.prob : 0,
    isUnknown,
    probabilities
  };
}
