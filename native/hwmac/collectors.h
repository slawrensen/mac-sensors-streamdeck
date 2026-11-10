#ifndef HWMAC_COLLECTORS_H
#define HWMAC_COLLECTORS_H
#include <stdbool.h>
#include <stdint.h>
#include <IOKit/IOKitLib.h>
#include "smc.h"
/* Rows one packet can carry, and rows the whole catalog can list; one Mac reads only the rows that apply to it. */
#define HWMAC_MAX_ROWS 128
#define HWMAC_MAX_CATALOG 256
/* What a chip family temperature may read on a Mac whose own model was not measured. Stats, the source of the family tables, treats a CPU
 * reading outside 10 to 120 °C as a broken sensor and drops a temperature that reads 0 (Modules/Sensors/readers.swift at the pinned commit);
 * such a value is withheld here for that read, never replaced by an older one. The measured model keeps the full temperature range. */
#define HWMAC_FAMILY_MINIMUM_C 10.0
#define HWMAC_FAMILY_MAXIMUM_C 120.0
/* The SMC's firmware status for a key it does not have. */
#define HWMAC_SMC_KEY_NOT_FOUND 0x84
/* A key reported as not found is asked again after 1 read, then 2, 4 and so on up to this many reads plus a per-row offset of up to 31,
 * about once a minute at the 1 s default. A key that was only missing for a moment returns within a few reads, while 20 to 60 rows a Mac
 * never has cost no SMC call on an ordinary read, and their rechecks do not land on one read. */
#define HWMAC_ABSENT_RECHECK_READS 64
#define HWMAC_MAX_CPUS 256
/* Performance levels a packet records (hw.nperflevels): Apple silicon has two or three. */
#define HWMAC_MAX_PERF_LEVELS 4

typedef struct {
	const char *key, *label, *group, *kind;
	/* scope 0: every Mac. 1: Apple silicon. 2: one chip family (selector), limited to the variants mask unless it is 0.
	 * 3: one measured model (selector). */
	unsigned scope, selector, variants;
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
	/* The CPU brand string and the chip family table it or the model table selects (empty when none). family and
	 * model_table are catalog indexes plus one, so a zeroed packet has no family and no model rows. */
	char cpu[64], table[16];
	unsigned family, model_table, variant;
	/* Physical cores of each performance level, top level first (hw.perflevelN.physicalcpu), and how many levels were read. */
	unsigned perf_levels, perf_cores[HWMAC_MAX_PERF_LEVELS];
	/* The model table was measured on this exact core layout; otherwise its rows still apply, and its family rows take the family window. */
	bool model_measured;
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
	uint32_t types[HWMAC_MAX_CATALOG], sizes[HWMAC_MAX_CATALOG];
	/* For a key the SMC reported as not found: reads left before it is asked again (0: asked on this read), and the wait that followed its last answer. */
	uint8_t absent[HWMAC_MAX_CATALOG], absent_wait[HWMAC_MAX_CATALOG];
} smc_context;
#define HWMAC_LINK_NAME 16
/* The name and full 64-bit byte counters the system reports for one interface index. */
typedef bool (*hwmac_link_counters)(unsigned index, char name[HWMAC_LINK_NAME], uint64_t *received, uint64_t *sent, void *context);
struct ifaddrs;
/* Sets family, variant, model_table, model_measured and table from the packet's model, chip, core layout, cpu and apple_silicon. */
void hwmac_resolve_platform(source_packet *packet);
size_t hwmac_catalog_count(void);
#if defined(HWMAC_TEST_BUILD) && HWMAC_TEST_BUILD
/* The test build's view of one catalog row, for testCatalog. */
const sensor_spec *hwmac_catalog_row(size_t index);
#endif
bool hwmac_row_applies(const sensor_spec *spec, const source_packet *packet);
/* The read loop over an open connection. The transport is a parameter so the test build can answer as another Mac's SMC. */
void hwmac_read_smc_rows(smc_context *context, source_packet *packet, smc_transport transport);
void hwmac_network_from(source_packet *packet, const struct ifaddrs *list, hwmac_link_counters counters, void *context);
double hwmac_continuous_ms(void);
double hwmac_awake_ms(void);
void hwmac_facts(source_packet *packet);
void hwmac_collect_smc(smc_context *context, source_packet *packet);
void hwmac_close_smc(smc_context *context);
void hwmac_collect_public(source_packet *packet);
/* Battery cycles and health from IOPowerSources and AppleSmartBattery, and the internal NVMe SMART temperature. No handle is held. */
void hwmac_collect_health(source_packet *packet);
#endif
