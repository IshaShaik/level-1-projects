// trainer.js
// Builds a small dense neural network in TensorFlow.js and trains it on
// normalized MediaPipe landmark feature vectors. The number of output
// classes always matches the number of pose classes the user created —
// nothing about the architecture is hard-coded.

import { FEATURE_LENGTH } from './poseDetector.js';

export const MIN_CLASSES = 2;
export const MIN_SAMPLES_PER_CLASS = 8;

/**
 * Checks whether a project's pose classes have enough data to train.
 * poses: [{ id, name, samples: [...] }]
 */
export function validateTrainingData(poses) {
  // Sirf woh poses jinke paas poore 8 samples hain
  const readyPoses = poses.filter((p) => p.samples.length >= MIN_SAMPLES_PER_CLASS);
  
  // Woh poses jinme kuch samples hain lekin 8 se kam hain (1 to 7)
  const partialPoses = poses.filter((p) => p.samples.length > 0 && p.samples.length < MIN_SAMPLES_PER_CLASS);

  // Agar ready poses 2 se kam hain toh error dikhao
  if (readyPoses.length < MIN_CLASSES) {
    let msg = `Train karne ke liye kam se kam ${MIN_CLASSES} poses mein ${MIN_SAMPLES_PER_CLASS} samples hone chahiye. (Aapke paas abhi ${readyPoses.length} ready hain).`;
    
    if (partialPoses.length > 0) {
      msg += ` Incomplete poses: ` + partialPoses.map((p) => `"${p.name}" (${p.samples.length}/${MIN_SAMPLES_PER_CLASS})`).join(', ');
    }
    
    return { valid: false, message: msg };
  }

  return { valid: true, message: '' };
}

function buildModel(numClasses) {
  const model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [FEATURE_LENGTH], units: 64, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: 32, activation: 'relu' }));
  model.add(tf.layers.dense({ units: numClasses, activation: 'softmax' }));
  model.compile({
    optimizer: tf.train.adam(0.01),
    loss: 'categoricalCrossentropy',
    metrics: ['accuracy']
  });
  return model;
}

/**
 * Trains a fresh classifier from the project's pose classes.
 * poses: [{ id, name, samples: [{ landmarks: number[99] }] }]
 * onProgress(stage, data) is called throughout: stages are
 * 'preparing' | 'building' | 'epoch' | 'done'
 */
export async function trainModel(poses, onProgress = () => {}) {
  onProgress('preparing', {});
  await tf.nextFrame();

  // Sirf unhi poses ko filter karein jinke paas 8 ya usse zyada samples hain
  const validPoses = poses.filter((p) => p.samples.length >= MIN_SAMPLES_PER_CLASS);

  const classNames = validPoses.map((p) => p.name);
  const features = [];
  const labels = [];

  validPoses.forEach((pose, classIndex) => {
    pose.samples.forEach((sample) => {
      features.push(sample.landmarks);
      labels.push(classIndex);
    });
  });

  onProgress('normalizing', {});
  await tf.nextFrame();

  const xs = tf.tensor2d(features, [features.length, FEATURE_LENGTH]);
  const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), classNames.length);

  onProgress('building', { numClasses: classNames.length, numSamples: features.length });
  await tf.nextFrame();

  const model = buildModel(classNames.length);

  const EPOCHS = 50;
  const useValidation = features.length >= classNames.length * (MIN_SAMPLES_PER_CLASS + 2);

  let finalAcc = 0;
  let finalLoss = 0;

  await model.fit(xs, ys, {
    epochs: EPOCHS,
    batchSize: Math.min(16, Math.max(4, Math.floor(features.length / 8))),
    shuffle: true,
    validationSplit: useValidation ? 0.15 : 0,
    callbacks: {
      onEpochEnd: async (epoch, logs) => {
        finalAcc = logs.acc !== undefined ? logs.acc : logs.accuracy;
        finalLoss = logs.loss;
        onProgress('epoch', {
          epoch: epoch + 1,
          totalEpochs: EPOCHS,
          accuracy: finalAcc,
          loss: finalLoss
        });
        await tf.nextFrame();
      }
    }
  });

  xs.dispose();
  ys.dispose();

  onProgress('done', {
    classNames,
    numSamples: features.length,
    accuracy: finalAcc,
    loss: finalLoss
  });

  return { model, classNames, accuracy: finalAcc, loss: finalLoss, numSamples: features.length };
}

/**
 * Persists the trained model into the browser's IndexedDB so it survives
 * navigation between Train / Test / Explore pages without re-training.
 */
export async function saveModelLocal(model, key) {
  await model.save(`indexeddb://${key}`);
}

export async function loadModelLocal(key) {
  return tf.loadLayersModel(`indexeddb://${key}`);
}

/**
 * Exports the trained model (topology + weights) via TensorFlow.js's
 * browser download handler, plus a metadata JSON with class labels and the
 * normalization scheme used at inference time.
 */
export async function exportModel(model, classNames) {
  await model.save('downloads://yoga-pose-model');

  const metadata = {
    modelName: 'Yoga Pose Model',
    classNames,
    featureConfig: {
      landmarkCount: 33,
      featuresPerLandmark: ['x', 'y', 'z'],
      featureLength: FEATURE_LENGTH
    },
    normalization: {
      method: 'hip-centered, torso-scaled',
      origin: 'midpoint of left/right hip landmarks (23, 24)',
      scale: 'distance between shoulder midpoint and hip midpoint'
    },
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'yoga-pose-model-metadata.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Exports the raw training dataset (landmarks only, no video) as JSON so
 * students can inspect exactly what the model was trained on.
 */
export function exportDataset(project) {
  const payload = {
    projectName: project.name,
    exportedAt: new Date().toISOString(),
    classes: project.poses.map((p) => ({
      name: p.name,
      sampleCount: p.samples.length,
      samples: p.samples.map((s) => ({
        landmarks: s.landmarks,
        timestamp: s.timestamp
      }))
    }))
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'yoga-pose-training-data.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
