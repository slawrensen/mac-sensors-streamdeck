#include "smc.h"
#include <string.h>
#include <math.h>

uint32_t smc_key(const char bytes[4]) {
	uint32_t value = 0;
	for (size_t i = 0; i < 4; i++) value = (value << 8) | (uint8_t)bytes[i];
	return value;
}
uint32_t smc_u32(const uint8_t *bytes) {
	uint32_t value;
	memcpy(&value, bytes, sizeof(value));
	return value;
}
smc_result smc_read_request(io_connect_t connection, uint8_t command, uint32_t key, uint32_t size, uint32_t index, uint8_t reply[80], smc_transport transport) {
	/* This is the only route to the user client. Reject before transport. */
	if (command != 5 && command != 8 && command != 9) return (smc_result){ .code = 1 };
	if (size > 32 || transport == NULL) return (smc_result){ .code = 2 };
	uint8_t request[80] = {0};
	memcpy(request, &key, sizeof(key));
	memcpy(request + 28, &size, sizeof(size));
	request[42] = command;
	memcpy(request + 44, &index, sizeof(index));
	memset(reply, 0, 80);
	size_t length = 80;
	kern_return_t status = transport(connection, 2, request, sizeof(request), reply, &length);
	if (status != KERN_SUCCESS) return (smc_result){ .code = 3, .system_code = status };
	if (length != 80) return (smc_result){ .code = 4 };
	if (reply[40] != 0) return (smc_result){ .code = 5, .firmware_code = reply[40] };
	return (smc_result){0};
}
bool smc_decode(uint32_t type, uint32_t size, const uint8_t *bytes, double *value) {
	if (bytes == NULL || value == NULL) return false;
	double result;
	if (type == smc_key("flt ") && size == 4) {
		/* Both supported Darwin architectures are little endian. */
		float sample; memcpy(&sample, bytes, sizeof(sample)); result = sample;
	} else if (type == smc_key("sp78") && size == 2) {
		uint16_t bits = ((uint16_t)bytes[0] << 8) | bytes[1];
		int16_t signed_bits; memcpy(&signed_bits, &bits, sizeof(bits));
		result = (double)signed_bits / 256.0;
	} else if (type == smc_key("fpe2") && size == 2) {
		result = (double)(((uint16_t)bytes[0] << 8) | bytes[1]) / 4.0;
	} else if ((type == smc_key("ui8 ") && size == 1) || (type == smc_key("ui16") && size == 2) || (type == smc_key("ui32") && size == 4)) {
		uint32_t integer = 0;
		for (uint32_t i = 0; i < size; i++) integer = (integer << 8) | bytes[i];
		result = integer;
	} else if (type == smc_key("ioft") && size == 8) {
		/* Unsigned 48.16 fixed point, little endian: on Mac17,9 TG0B read 33 33 24 00 00 00 00 00 while its HID service read 36.2. */
		uint64_t bits = 0;
		for (uint32_t i = size; i > 0; i--) bits = (bits << 8) | bytes[i - 1];
		result = (double)bits / HWMAC_IOFT_ONE;
	} else return false;
	if (!isfinite(result)) return false;
	*value = result;
	return true;
}
