#ifndef HWMAC_SMC_H
#define HWMAC_SMC_H
#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>
#include <IOKit/IOKitLib.h>
/* Independently expressed protocol byte facts; no private Apple declaration block. */
typedef struct {
	int code;
	kern_return_t system_code;
	uint8_t firmware_code;
} smc_result;
typedef kern_return_t (*smc_transport)(io_connect_t, uint32_t, const void *, size_t, void *, size_t *);
uint32_t smc_key(const char bytes[4]);
uint32_t smc_u32(const uint8_t *bytes);
smc_result smc_read_request(io_connect_t connection, uint8_t command, uint32_t key, uint32_t size, uint32_t index, uint8_t reply[80], smc_transport transport);
/* One degree in an ioft value: 16 fractional bits. */
#define HWMAC_IOFT_ONE 65536.0
bool smc_decode(uint32_t type, uint32_t size, const uint8_t *bytes, double *value);
#endif
