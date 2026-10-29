#ifndef HWMAC_COLLECTORS_H
#define HWMAC_COLLECTORS_H
#include <stdbool.h>
#include <stdint.h>
#include <IOKit/IOKitLib.h>
#define HWMAC_MAX_ROWS 128
#define HWMAC_MAX_CPUS 256

typedef struct {
	const char *key, *label, *group, *kind;
	unsigned scope;
	double minimum, maximum;
} sensor_spec;
typedef struct {
	char key[80], label[80], group[24], kind[20], unit[12];
	double value, continuous_ms, wall_seconds;
	bool valid;
	int error, operation;
	unsigned firmware_error;
	int64_t system_error;
} sensor_row;
typedef struct {
	sensor_row rows[HWMAC_MAX_ROWS];
	unsigned count;
	char model[128], chip[64];
	int apple_silicon, translated, translation_error;
	bool font_available;
	double continuous_ms, awake_ms, wall_seconds, duration_ms;
	uint32_t cpu_ticks[HWMAC_MAX_CPUS][4];
	unsigned cpu_count;
	bool cpu_valid, network_valid, storage_valid;
	uint64_t network_in, network_out, network_members;
	uint64_t storage_read, storage_write, storage_members;
	int error;
	int64_t system_error;
} source_packet;
typedef struct {
	io_connect_t connection;
	uint32_t types[HWMAC_MAX_ROWS], sizes[HWMAC_MAX_ROWS];
	bool catalog_ready;
} smc_context;
bool hwmac_catalog_applies(unsigned scope, const char *model, const char *chip, int apple_silicon);
double hwmac_continuous_ms(void);
double hwmac_awake_ms(void);
void hwmac_facts(source_packet *packet);
void hwmac_collect_smc(smc_context *context, source_packet *packet);
void hwmac_close_smc(smc_context *context);
void hwmac_collect_public(source_packet *packet);
/* Battery cycles and health from IOPowerSources and AppleSmartBattery, and the internal NVMe SMART temperature. No handle is held. */
void hwmac_collect_health(source_packet *packet);
#endif
