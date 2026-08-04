#include "../sandbox_native_maths/sandbox_native_maths.h"
static double gDry = 0;
extern "C" int soemdsp_soem_reverb_create(double sampleRate) { (void)sampleRate; return 1; }
extern "C" void soemdsp_soem_reverb_destroy(int h) { (void)h; }
extern "C" void soemdsp_soem_reverb_reset(int h) { (void)h; }
extern "C" void soemdsp_soem_reverb_set_params(int h, double,double,double,double,double,double,double,double,double,double,double,double,double,double,double,double,double,double,double,double,double,double,double) { (void)h; }
extern "C" void soemdsp_soem_reverb_process(int h, double inL, double inR) { (void)h; gDry = inL; }
extern "C" double soemdsp_soem_reverb_left(int h) { (void)h; return gDry; }
extern "C" double soemdsp_soem_reverb_right(int h) { (void)h; return gDry; }
extern "C" double soemdsp_soem_reverb_wet_left(int h) { (void)h; return gDry * 0.5; }
extern "C" double soemdsp_soem_reverb_wet_right(int h) { (void)h; return gDry * 0.5; }
extern "C" double soemdsp_soem_reverb_dry_left(int h) { (void)h; return gDry; }
extern "C" double soemdsp_soem_reverb_dry_right(int h) { (void)h; return gDry; }
extern "C" int soemdsp_soem_reverb_version() { return 99; }
static const char meta[] = "{}";
extern "C" const char* soemdsp_soem_reverb_metadata_json() { return meta; }
extern "C" int soemdsp_soem_reverb_metadata_json_size() { return 2; }
