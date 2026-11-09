#ifndef APEX_IQ_BRIDGE_H
#define APEX_IQ_BRIDGE_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
/* Experimental portable boundary, not a platform module. Caller pins immutable
 * request bytes for the call. Response and written are valid, writable, disjoint
 * from all other arguments. No pointer is retained. Never call into JS from the
 * cancellation callback: it must be thread-safe, nonthrowing, and return nonzero
 * when cancellation is requested. Cancel may race completion; JS fences late
 * results. Returns 0 success, 1 invalid, 2 kernel, 3 allocation/runtime, 4 cancel.
 * On any failure response is untouched and *written is zero. On success only the
 * first *written bytes are changed. Output capacity must be <=262176 and sufficient.
 * One call per session must be enforced by the native owner, not this stateless ABI. */
int apex_iq_bridge_v1(const uint8_t* request, size_t request_size,
    uint8_t* response, size_t response_capacity, size_t* written,
    int (*cancelled)(void*), void* cancel_context);
#ifdef __cplusplus
}
#endif
#endif
