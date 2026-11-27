import { duplicateScore } from "./duplicates.js"

export function findUncopiedReferences(localReferences, cloudReferences) {
  return localReferences.filter(local => !cloudReferences.some(cloud => duplicateScore(local, cloud) >= 2))
}
