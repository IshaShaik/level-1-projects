// poseLibrary.js
// Fixed curriculum of 10 beginner-friendly yoga poses shown in the
// "Your Training Poses" section. Each entry pairs a pose name with a simple
// reference illustration so students never have to type a pose name — they
// just look at the picture, match it, and capture.

export const POSE_LIBRARY = [
  { name: 'Neck Stretch', image: 'images/poses/neck.png' },
  { name: 'Mountain Pose', image: 'images/poses/Mountain Pose.png' },
  { name: 'Tree Pose', image: 'images/poses/Tree Pose.png' },
  { name: 'Standing Forward Bend', image: 'images/poses/standing-forward-bend.svg' },
  { name: 'Warrior I', image: 'images/poses/Warrior 1.png' },
  { name: 'Warrior II', image: 'images/poses/Warrior 2.png' },
  { name: 'Triangle Pose', image: 'images/poses/Triangle Pose.png' },
  { name: 'Cat Pose', image: 'images/poses/cat-pose.png' },
  { name: 'Cow Pose', image: 'images/poses/Cow Pose.png' },
  { name: "Child's Pose", image: 'images/poses/Childs Pose.png' }
];

const FALLBACK_IMAGE = 'images/poses/Mountain Pose.png';

/** Looks up the reference image for a pose by name (case-insensitive). */
export function getPoseImage(name) {
  const match = POSE_LIBRARY.find(
    (p) => p.name.toLowerCase() === String(name || '').trim().toLowerCase()
  );
  return match ? match.image : FALLBACK_IMAGE;
}
