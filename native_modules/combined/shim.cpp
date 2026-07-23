// Freestanding memory intrinsics for the combined -nostdlib link. Individual
// per-module links resolve these from the clang driver; a pure wasm-ld link
// of many objects does not, so define them once here.
#include <stddef.h>
extern "C" {
void *memset(void *dest, int ch, size_t count) {
  unsigned char *d = (unsigned char *)dest;
  while (count--) *d++ = (unsigned char)ch;
  return dest;
}
void *memcpy(void *dest, const void *src, size_t count) {
  unsigned char *d = (unsigned char *)dest;
  const unsigned char *s = (const unsigned char *)src;
  while (count--) *d++ = *s++;
  return dest;
}
void *memmove(void *dest, const void *src, size_t count) {
  unsigned char *d = (unsigned char *)dest;
  const unsigned char *s = (const unsigned char *)src;
  if (d < s) { while (count--) *d++ = *s++; }
  else { d += count; s += count; while (count--) *--d = *--s; }
  return dest;
}
int memcmp(const void *a, const void *b, size_t count) {
  const unsigned char *x = (const unsigned char *)a, *y = (const unsigned char *)b;
  while (count--) { if (*x != *y) return *x - *y; x++; y++; }
  return 0;
}
}
