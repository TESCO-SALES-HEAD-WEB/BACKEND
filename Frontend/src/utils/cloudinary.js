// ─────────────────────────────────────────────────────────────────────────────
// Cloudinary file upload (direct, unsigned)
// Files are uploaded straight from the browser to Cloudinary using an UNSIGNED
// upload preset, so they never pass through (or get stored on) our own backend.
// Cloudinary returns a permanent URL which we store on the lead's `attachments`
// array via the normal save path — no backend/API changes are required.
//
// Configure these in the frontend env (e.g. .env / Vercel Environment Variables):
//   VITE_CLOUDINARY_CLOUD_NAME=your_cloud_name
//   VITE_CLOUDINARY_UPLOAD_PRESET=your_unsigned_preset
// The cloud name is public and safe to expose; the API secret is NEVER used here.
// ─────────────────────────────────────────────────────────────────────────────

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

// Is file upload configured? (Lets the UI show a helpful message instead of failing.)
export const isUploadConfigured = () => Boolean(CLOUD_NAME && UPLOAD_PRESET);

// Max upload size (bytes). Cloudinary's free tier allows up to 10MB for images and
// larger for raw/video; keep a sane client-side guard. Adjust as needed.
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

// Human-readable size, e.g. "2.4 MB".
export const formatBytes = (n) => {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
};

// Upload one File/Blob to Cloudinary. Resolves to an attachment record:
//   { url, publicId, name, type, size, resourceType, uploadedAt }
export async function uploadToCloudinary(file, { uploadedBy } = {}) {
  if (!isUploadConfigured()) {
    throw new Error('File upload is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.');
  }
  if (!file) throw new Error('No file selected.');
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`File too large (max ${formatBytes(MAX_UPLOAD_BYTES)}).`);
  }

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', UPLOAD_PRESET);

  // `auto` lets Cloudinary accept images, PDFs, and other raw files with one endpoint.
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`;

  let res;
  try {
    res = await fetch(endpoint, { method: 'POST', body: form });
  } catch {
    throw new Error('Could not reach the upload service. Check your connection.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Upload failed (${res.status}).`);
  }

  return {
    url: data.secure_url,
    publicId: data.public_id,
    name: file.name || data.original_filename || 'file',
    type: file.type || '',
    size: file.size || data.bytes || 0,
    resourceType: data.resource_type || 'raw',
    uploadedAt: new Date().toISOString(),
    ...(uploadedBy ? { uploadedBy } : {}),
  };
}

// Upload several files, returning the successful attachment records. Individual
// failures are collected and thrown together so partial uploads still succeed.
export async function uploadManyToCloudinary(files, opts) {
  const list = Array.from(files || []);
  const ok = [];
  const errors = [];
  for (const f of list) {
    try { ok.push(await uploadToCloudinary(f, opts)); }
    catch (e) { errors.push(`${f.name}: ${e.message}`); }
  }
  return { ok, errors };
}
