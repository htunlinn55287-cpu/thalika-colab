export const MAX_SCRIPT_CHARACTERS = 50000;

// Shorter than the model's hard ceiling on purpose: long single takes (≈18-28s of audio from a
// 420-char chunk) are exactly where VoxCPM2's LocDiT attention degrades and timbre drifts, and
// where mid-take quality collapses before recovering. ~180 chars yields ~8-12s chunks, which stay
// inside the model's stable region. Cost: more chunks (more API calls). This is the single biggest
// cross-chunk stability lever. Keep it ≤ ~220.
export const REMOTE_TTS_CHUNK_CHARACTERS = 180;
