/** DICOM Modality (0008,0060) codes — aligned with DICOM PS3.16 CID 29/32. */
export interface DicomModalityOption {
  value: string;
  code: string;
  name: string;
}

const MODALITY_ENTRIES: Omit<DicomModalityOption, "value">[] = [
  { code: "AR", name: "Autorefraction" },
  { code: "ASMT", name: "Content Assessment Results" },
  { code: "AU", name: "Audio" },
  { code: "BDUS", name: "Ultrasound Bone Densitometry" },
  { code: "BI", name: "Biomagnetic Imaging" },
  { code: "BMD", name: "Bone Mineral Densitometry" },
  { code: "CR", name: "Computed Radiography" },
  { code: "CT", name: "Computed Tomography" },
  { code: "CTPROTOCOL", name: "CT Protocol" },
  { code: "DG", name: "Diaphanography" },
  { code: "DOC", name: "Document" },
  { code: "DX", name: "Digital Radiography" },
  { code: "ECG", name: "Electrocardiography" },
  { code: "EPS", name: "Cardiac Electrophysiology" },
  { code: "ES", name: "Endoscopy" },
  { code: "FID", name: "Fiducials" },
  { code: "GM", name: "General Microscopy" },
  { code: "HC", name: "Hard Copy" },
  { code: "HD", name: "Hemodynamic Waveform" },
  { code: "IO", name: "Intra-oral Radiography" },
  { code: "IVOCT", name: "Intravascular Optical Coherence Tomography" },
  { code: "IVUS", name: "Intravascular Ultrasound" },
  { code: "KER", name: "Keratometry" },
  { code: "KO", name: "Key Object Selection" },
  { code: "LEN", name: "Lensometry" },
  { code: "LP", name: "Laparoscopic" },
  { code: "LS", name: "Laser Surface Scan" },
  { code: "MG", name: "Mammography" },
  { code: "MR", name: "Magnetic Resonance" },
  { code: "M3D", name: "Model for 3D Manufacturing" },
  { code: "NM", name: "Nuclear Medicine" },
  { code: "OAM", name: "Ophthalmic Axial Measurements" },
  { code: "OCT", name: "Optical Coherence Tomography" },
  { code: "OP", name: "Ophthalmic Photography" },
  { code: "OPM", name: "Ophthalmic Mapping" },
  { code: "OPR", name: "Ophthalmic Refraction" },
  { code: "OPT", name: "Ophthalmic Tomography" },
  { code: "OPV", name: "Ophthalmic Visual Field" },
  { code: "OSS", name: "Optical Surface Scan" },
  { code: "OT", name: "Other" },
  { code: "PLAN", name: "Plan" },
  { code: "PR", name: "Presentation State" },
  { code: "PT", name: "Positron Emission Tomography" },
  { code: "PX", name: "Panoramic X-Ray" },
  { code: "REG", name: "Registration" },
  { code: "RESP", name: "Respiratory Waveform" },
  { code: "RF", name: "Radiofluoroscopy" },
  { code: "RG", name: "Radiographic Imaging" },
  { code: "RT", name: "Radiotherapy" },
  { code: "RTDOSE", name: "Radiotherapy Dose" },
  { code: "RTIMAGE", name: "Radiotherapy Image" },
  { code: "RTPLAN", name: "Radiotherapy Plan" },
  { code: "RTRECORD", name: "Radiotherapy Treatment Record" },
  { code: "RTSTRUCT", name: "Radiotherapy Structure Set" },
  { code: "RWV", name: "Real World Value Map" },
  { code: "SEG", name: "Segmentation" },
  { code: "SM", name: "Slide Microscopy" },
  { code: "SMR", name: "Stereometric Relationship" },
  { code: "SR", name: "Structured Report" },
  { code: "SRF", name: "Subjective Refraction" },
  { code: "STAIN", name: "Automated Slide Stainer" },
  { code: "TG", name: "Thermography" },
  { code: "US", name: "Ultrasound" },
  { code: "VA", name: "Visual Acuity" },
  { code: "XA", name: "X-Ray Angiography" },
  { code: "XC", name: "External-camera Photography" },
];

export function formatModalityLabel(entry: Pick<DicomModalityOption, "code" | "name">): string {
  if (!entry.code) return entry.name;
  return `${entry.code} — ${entry.name}`;
}

export const DICOM_MODALITIES: DicomModalityOption[] = [
  { value: "", code: "", name: "Any modality" },
  ...MODALITY_ENTRIES.map((entry) => ({
    value: entry.code,
    ...entry,
  })),
];

export function isModalityTag(tag: string): boolean {
  return tag.trim().toLowerCase() === "modality";
}

function modalityMatchScore(code: string, query: string): number {
  if (code === query) return 0;
  if (code.startsWith(query)) return 1;
  if (code.includes(query)) return 2;
  return -1;
}

/** Filter modalities by DICOM code (short name), ranked exact → prefix → contains. */
export function filterModalities(query: string, options?: { includeAny?: boolean }): DicomModalityOption[] {
  const includeAny = options?.includeAny ?? true;
  const q = query.trim().toUpperCase();

  if (!q) {
    return includeAny ? DICOM_MODALITIES : DICOM_MODALITIES.filter((m) => m.code);
  }

  const ranked = MODALITY_ENTRIES.map((entry) => {
    const score = modalityMatchScore(entry.code, q);
    return score >= 0 ? { entry, score } : null;
  })
    .filter((item): item is { entry: (typeof MODALITY_ENTRIES)[number]; score: number } => item !== null)
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score;
      if (a.score === 1 || a.score === 2) {
        return a.entry.code.length - b.entry.code.length;
      }
      return a.entry.code.localeCompare(b.entry.code);
    })
    .map(({ entry }) => ({ value: entry.code, ...entry }));

  return ranked;
}
