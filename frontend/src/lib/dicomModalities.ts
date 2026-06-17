/** Common DICOM modality codes for migration filters. */
export const DICOM_MODALITIES = [
  { value: "", label: "Any modality" },
  { value: "CT", label: "CT — Computed Tomography" },
  { value: "MR", label: "MR — Magnetic Resonance" },
  { value: "US", label: "US — Ultrasound" },
  { value: "CR", label: "CR — Computed Radiography" },
  { value: "DX", label: "DX — Digital Radiography" },
  { value: "MG", label: "MG — Mammography" },
  { value: "NM", label: "NM — Nuclear Medicine" },
  { value: "PT", label: "PT — PET" },
  { value: "RF", label: "RF — Radio Fluoroscopy" },
  { value: "XA", label: "XA — X-Ray Angiography" },
  { value: "SC", label: "SC — Secondary Capture" },
  { value: "SR", label: "SR — Structured Report" },
  { value: "DOC", label: "DOC — Document" },
  { value: "OT", label: "OT — Other" },
] as const;
