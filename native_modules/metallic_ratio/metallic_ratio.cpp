// soemdsp-native-module: metallic_ratio
// soemdsp-native-label: Metallic Ratio
// soemdsp-native-target: metallicRatio
// soemdsp-native-kind: math
// soemdsp-native-lib: https://github.com/RobinSchmidt/RS-MET/blob/work/Libraries/RobsJuceModules/rapt/Math/Misc/RatioGenerator.h
//
// A tribute module: this is Robin Schmidt's RAPT::rsRatioGenerator::metallic()
// formula from RS-MET (https://github.com/RobinSchmidt/RS-MET), ported
// directly rather than merely inspired-by, the way this sandbox's Cookbook
// Filter, Ladder Filter, and TB-303 Filter modules already are.
//
// metallic(n) = (n + sqrt(n^2 + 4)) / 2 -- the "metallic mean" family:
// n=0 -> 1, n=1 -> the golden ratio (~1.618), n=2 -> silver (~2.414),
// n=3 -> bronze (~3.303), and onward with no traditional name.
// https://en.wikipedia.org/wiki/Metallic_mean
//
// RS-MET's rsRatioGenerator generalizes this further with a free exponent
// parameter (for prime-power and range-split ratio families used to seed
// supersaw detune spreads or feedback-delay-network lengths) -- this port
// keeps only the named, closed-form metallic-mean case so the output stays
// exact (real sqrt, no approximation) rather than trading precision for
// generality on a module that exists specifically to showcase precise
// irrational ratios.

namespace {

static const char kMetadataJson[] =
  "{"
    "\"module\":\"metallic_ratio\","
    "\"label\":\"Metallic Ratio\","
    "\"targetType\":\"metallicRatio\","
    "\"kind\":\"math\","
    "\"inputs\":[],"
    "\"outputs\":[\"Ratio\"],"
    "\"parameters\":["
      "{"
        "\"key\":\"index\","
        "\"label\":\"Index\","
        "\"defaultValue\":1,"
        "\"min\":0,"
        "\"mid\":4,"
        "\"max\":8,"
        "\"step\":\"any\","
        "\"tooltip\":\"n in (n + sqrt(n^2 + 4)) / 2. 0 = unity, 1 = golden ratio, 2 = silver, 3 = bronze.\""
      "}"
    "]"
  "}";

}  // namespace

extern "C" double soemdsp_metallic_ratio_sample(double index) {
  const double n = index;
  return 0.5 * (n + __builtin_sqrt(n * n + 4.0));
}

extern "C" int soemdsp_metallic_ratio_version() {
  return 1;
}

extern "C" const char* soemdsp_metallic_ratio_metadata_json() {
  return kMetadataJson;
}

extern "C" int soemdsp_metallic_ratio_metadata_json_size() {
  return sizeof(kMetadataJson) - 1;
}
