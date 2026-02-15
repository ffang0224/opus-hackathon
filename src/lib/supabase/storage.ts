export function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function buildVendorDocPath(userId: string, applicationId: string, inputKey: string, filename: string) {
  const safeName = sanitizeFilename(filename);
  return `${userId}/${applicationId}/${inputKey}/${safeName}`;
}
