// soemdsp-native-module: harmonic_series
// soemdsp-native-label: Harmonic Series
// soemdsp-native-target: harmonicSeries
// soemdsp-native-kind: math
//
// Zero-based harmonic CV: Harmonic 0 = ×1 (fundamental).
// effective e = Harmonic + Offset (−1…+1 toward next harmonic down/up).
// e ≥ 0 → mult = 1 + e; e < 0 → mult = 1 / (1 − e).
// ƒ = baseHz × mult. ƒ0 = baseHz unchanged. Wired ƒ cancels Frequency (host-side).

namespace {

static const char kMetadataJson[] =
  "{"
    "\"module\":\"harmonic_series\","
    "\"label\":\"Harmonic Series\","
    "\"targetType\":\"harmonicSeries\","
    "\"kind\":\"math\","
    "\"inputs\":[\"f\"],"
    "\"outputs\":[\"f\",\"f0\"],"
    "\"parameters\":["
      "{"
        "\"key\":\"harmonic\","
        "\"label\":\"Harmonic\","
        "\"defaultValue\":0,"
        "\"min\":-4,"
        "\"mid\":0,"
        "\"max\":64,"
        "\"step\":\"any\","
        "\"tooltip\":\"0 = first harmonic (×1). Each step multiplies to the next harmonic; negatives divide.\""
      "},"
      "{"
        "\"key\":\"offset\","
        "\"label\":\"Offset\","
        "\"defaultValue\":0,"
        "\"min\":-1,"
        "\"mid\":0,"
        "\"max\":1,"
        "\"step\":\"any\","
        "\"tooltip\":\"−1 = next harmonic down, +1 = next harmonic up from Harmonic.\""
      "},"
      "{"
        "\"key\":\"frequency\","
        "\"label\":\"Frequency\","
        "\"defaultValue\":100,"
        "\"min\":0,"
        "\"mid\":100,"
        "\"max\":10000,"
        "\"step\":\"any\","
        "\"unit\":\"Hz\","
        "\"tooltip\":\"Base Hz when ƒ is unwired. Wired ƒ cancels this knob.\""
      "}"
    "]"
  "}";

}  // namespace

extern "C" double soemdsp_harmonic_series_sample(double baseHz, double harmonic, double offset) {
  const double e = harmonic + offset;
  const double mult = (e >= 0.0) ? (1.0 + e) : (1.0 / (1.0 - e));
  return baseHz * mult;
}

extern "C" double soemdsp_harmonic_series_effective(double harmonic, double offset) {
  return harmonic + offset;
}

extern "C" int soemdsp_harmonic_series_version() {
  return 1;
}

extern "C" const char* soemdsp_harmonic_series_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_harmonic_series_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
