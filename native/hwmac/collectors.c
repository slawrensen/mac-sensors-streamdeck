#include "collectors.h"
#include "smc.h"
#include <CoreFoundation/CoreFoundation.h>
#include <CoreText/CoreText.h>
#include <IOKit/IOCFPlugIn.h>
#include <IOKit/ps/IOPowerSources.h>
#include <IOKit/ps/IOPSKeys.h>
#include <IOKit/pwr_mgt/IOPM.h>
#include <IOKit/storage/IOStorageProtocolCharacteristics.h>
#include <IOKit/storage/nvme/NVMeSMARTLibExternal.h>
#include <mach/mach.h>
#include <mach/mach_time.h>
#include <sys/sysctl.h>
#include <sys/mount.h>
#include <net/if.h>
#include <net/if_dl.h>
#include <net/if_mib.h>
#include <net/if_types.h>
#include <ifaddrs.h>
#include <errno.h>
#include <limits.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include "catalog.inc"

_Static_assert(sizeof(HWMAC_CATALOG) / sizeof(HWMAC_CATALOG[0]) <= HWMAC_MAX_CATALOG, "catalog rows");
size_t hwmac_catalog_count(void) { return sizeof(HWMAC_CATALOG) / sizeof(HWMAC_CATALOG[0]); }
const sensor_spec *hwmac_catalog_row(size_t index) { return index < hwmac_catalog_count() ? &HWMAC_CATALOG[index] : NULL; }
/* Chip variant bits: the brand string is the family's brand alone, or the brand followed by one of these names. */
static unsigned brand_variant(const char *cpu, const char *brand) {
	size_t length = strlen(brand);
	if (strncmp(cpu, brand, length) != 0) return 0;
	const char *rest = cpu + length;
	return rest[0] == 0 ? 1u : strcmp(rest, " Pro") == 0 ? 2u : strcmp(rest, " Max") == 0 ? 4u : strcmp(rest, " Ultra") == 0 ? 8u : 0;
}
void hwmac_resolve_platform(source_packet *packet) {
	packet->family = 0; packet->model_table = 0; packet->variant = 0; packet->table[0] = 0;
	if (packet->apple_silicon != 1) return;
	/* A measured model names its own family, so it keeps its table when the brand string is not the chip's (a translated process reads another). */
	for (size_t i = 0; i < sizeof(HWMAC_MODELS) / sizeof(HWMAC_MODELS[0]); i++) {
		if (strcmp(packet->model, HWMAC_MODELS[i].model) == 0 && strcmp(packet->chip, HWMAC_MODELS[i].chip) == 0) { packet->model_table = (unsigned)i + 1; packet->family = HWMAC_MODELS[i].family + 1; packet->variant = HWMAC_MODELS[i].variant; break; }
	}
	/* Otherwise the whole string must be a listed brand and variant: "Apple M1 (Virtual)" or a later chip matches none. */
	for (size_t i = 0; packet->family == 0 && i < sizeof(HWMAC_FAMILIES) / sizeof(HWMAC_FAMILIES[0]); i++) {
		unsigned variant = brand_variant(packet->cpu, HWMAC_FAMILIES[i].brand);
		if ((variant & HWMAC_FAMILIES[i].variants) != 0) { packet->family = (unsigned)i + 1; packet->variant = variant; }
	}
	if (packet->family != 0) snprintf(packet->table, sizeof(packet->table), "%s", HWMAC_FAMILIES[packet->family - 1].name);
}
bool hwmac_row_applies(const sensor_spec *spec, const source_packet *packet) {
	switch (spec->scope) {
		case 0: return true;
		case 1: return packet->apple_silicon == 1;
		case 2: return packet->family == spec->selector + 1 && (spec->variants == 0 || (spec->variants & packet->variant) != 0);
		case 3: return packet->model_table == spec->selector + 1;
		default: return false;
	}
}
static double tick_ms(uint64_t ticks) {
	mach_timebase_info_data_t base;
	if (mach_timebase_info(&base) != KERN_SUCCESS || base.denom == 0) return NAN;
	return (double)ticks * (double)base.numer / (double)base.denom / 1e6;
}
double hwmac_continuous_ms(void) { return tick_ms(mach_continuous_time()); }
double hwmac_awake_ms(void) { return tick_ms(mach_absolute_time()); }
static double wall_now(void) {
	struct timespec time;
	if (clock_gettime(CLOCK_REALTIME, &time) != 0) return NAN;
	return (double)time.tv_sec + (double)time.tv_nsec / 1e9;
}
static bool sys_number(const char *name, void *value, size_t size) {
	size_t length = size;
	return sysctlbyname(name, value, &length, NULL, 0) == 0 && length == size;
}
void hwmac_facts(source_packet *packet) {
	size_t length = sizeof(packet->model);
	if (sysctlbyname("hw.model", packet->model, &length, NULL, 0) != 0 || length == 0 || length > sizeof(packet->model)) packet->model[0] = 0;
	packet->model[sizeof(packet->model) - 1] = 0;
	int family = 0;
	packet->apple_silicon = sys_number("hw.optional.arm64", &family, sizeof(family)) ? (family == 1) : -1;
	int translated = 0; errno = 0;
	if (sys_number("sysctl.proc_translated", &translated, sizeof(translated))) packet->translated = translated == 1;
	else { packet->translated = -1; packet->translation_error = errno != 0 ? errno : EIO; }
	io_registry_entry_t entry = IORegistryEntryFromPath(kIOMainPortDefault, "IODeviceTree:/arm-io");
	if (entry != 0) {
		CFTypeRef property = IORegistryEntryCreateCFProperty(entry, CFSTR("device_type"), kCFAllocatorDefault, 0);
		if (property != NULL && CFGetTypeID(property) == CFDataGetTypeID()) {
			CFIndex count = CFDataGetLength((CFDataRef)property);
			if (count > 0 && count < (CFIndex)sizeof(packet->chip)) memcpy(packet->chip, CFDataGetBytePtr((CFDataRef)property), (size_t)count);
			char *suffix = strstr(packet->chip, "-io"); if (suffix != NULL) *suffix = 0;
		}
		if (property != NULL) CFRelease(property);
		IOObjectRelease(entry);
	}
	length = sizeof(packet->cpu);
	if (sysctlbyname("machdep.cpu.brand_string", packet->cpu, &length, NULL, 0) != 0 || length == 0 || length > sizeof(packet->cpu)) packet->cpu[0] = 0;
	packet->cpu[sizeof(packet->cpu) - 1] = 0;
	hwmac_resolve_platform(packet);
}
static const char *unit_for(const char *kind) {
	if (strcmp(kind, "temperature") == 0) return "°C";
	if (strcmp(kind, "fan") == 0) return "RPM";
	if (strcmp(kind, "voltage") == 0) return "V";
	if (strcmp(kind, "current") == 0) return "A";
	if (strcmp(kind, "power") == 0) return "W";
	return "B";
}
static sensor_row *new_row(source_packet *packet, const char *key, const char *label, const char *group, const char *kind, const char *unit) {
	if (packet->count >= HWMAC_MAX_ROWS) return NULL;
	sensor_row *row = &packet->rows[packet->count++];
	snprintf(row->key, sizeof(row->key), "%s", key);
	snprintf(row->label, sizeof(row->label), "%s", label);
	snprintf(row->group, sizeof(row->group), "%s", group);
	snprintf(row->kind, sizeof(row->kind), "%s", kind);
	snprintf(row->unit, sizeof(row->unit), "%s", unit);
	row->value = NAN;
	return row;
}
static void observed(sensor_row *row, double value) {
	if (row == NULL) return;
	row->continuous_ms = hwmac_continuous_ms(); row->wall_seconds = wall_now();
	row->valid = isfinite(value) && isfinite(row->continuous_ms) && isfinite(row->wall_seconds);
	row->value = row->valid ? value : NAN;
}
static void system_value(source_packet *packet, const char *key, const char *label, const char *group, double value) {
	observed(new_row(packet, key, label, group, "other", "B"), value);
}
void hwmac_close_smc(smc_context *context) {
	if (context->connection != 0) IOServiceClose(context->connection);
	memset(context, 0, sizeof(*context));
}
void hwmac_collect_smc(smc_context *context, source_packet *packet) {
	double start = hwmac_continuous_ms(); hwmac_facts(packet);
	if (context->connection == 0) {
		io_service_t service = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("AppleSMC"));
		if (service == 0) { packet->error = 10; goto done; }
		kern_return_t status = IOServiceOpen(service, mach_task_self(), 0, &context->connection);
		IOObjectRelease(service);
		if (status != KERN_SUCCESS) { packet->error = 11; packet->system_error = status; context->connection = 0; goto done; }
	}
	hwmac_read_smc_rows(context, packet, IOConnectCallStructMethod);
 done:
	packet->continuous_ms = hwmac_continuous_ms(); packet->awake_ms = hwmac_awake_ms(); packet->wall_seconds = wall_now(); packet->duration_ms = packet->continuous_ms - start;
}
void hwmac_read_smc_rows(smc_context *context, source_packet *packet, smc_transport transport) {
	bool broken = false;
	for (size_t i = 0; i < sizeof(HWMAC_CATALOG) / sizeof(HWMAC_CATALOG[0]); i++) {
		const sensor_spec *spec = &HWMAC_CATALOG[i];
		if (!hwmac_row_applies(spec, packet)) continue;
		sensor_row *row = new_row(packet, spec->key, spec->label, spec->group, spec->kind, unit_for(spec->kind));
		if (row == NULL) { packet->error = 12; break; }
		uint8_t reply[80]; smc_result result = {0};
		uint32_t key = smc_key(spec->key);
		/* Metadata is bounded discovery, cached only for this connection. Missing keys retry. */
		if (context->sizes[i] == 0) {
			row->operation = 9;
			result = smc_read_request(context->connection, 9, key, 0, 0, reply, transport);
			if (result.code == 0) {
				context->types[i] = smc_u32(reply + 32); context->sizes[i] = smc_u32(reply + 28);
				if (context->sizes[i] == 0 || context->sizes[i] > 32) { result.code = 2; context->sizes[i] = 0; }
			}
		}
		double acquired = NAN, acquired_wall = NAN;
		if (result.code == 0) { row->operation = 5; acquired = hwmac_continuous_ms(); acquired_wall = wall_now(); result = smc_read_request(context->connection, 5, key, context->sizes[i], 0, reply, transport); }
		if (result.code != 0) {
			row->error = result.code; row->system_error = result.system_code; row->firmware_error = result.firmware_code;
			if (result.code == 3) broken = true;
			continue;
		}
		double value, minimum = spec->minimum, maximum = spec->maximum;
		if (spec->scope == 2 && packet->model_table == 0) { minimum = HWMAC_FAMILY_MINIMUM_C; maximum = HWMAC_FAMILY_MAXIMUM_C; }
		if (!smc_decode(context->types[i], context->sizes[i], reply + 48, &value) || value < minimum || value > maximum) { row->error = 13; continue; }
		observed(row, value);
		/* Age from the start of the actual read, never from a delayed return. */
		row->continuous_ms = acquired; row->wall_seconds = acquired_wall;
	}
	if (broken) hwmac_close_smc(context);
}
static int compare_u64(const void *a, const void *b) {
	uint64_t aa = *(const uint64_t *)a, bb = *(const uint64_t *)b;
	return aa < bb ? -1 : aa > bb ? 1 : 0;
}
static uint64_t membership(uint64_t *members, size_t count) {
	qsort(members, count, sizeof(*members), compare_u64);
	uint64_t hash = UINT64_C(1469598103934665603);
	for (size_t i = 0; i < count; i++) for (unsigned shift = 0; shift < 64; shift += 8) { hash ^= (members[i] >> shift) & 255; hash *= UINT64_C(1099511628211); }
	return hash;
}
_Static_assert(sizeof(((struct ifmibdata *)0)->ifmd_name) == HWMAC_LINK_NAME, "interface name width");
/* getifaddrs if_data byte counters are u_int32_t and wrap every 4 GiB. The IFMIB
 * row for the same index carries if_data64, readable without an entitlement. */
static bool ifmib_counters(unsigned index, char name[HWMAC_LINK_NAME], uint64_t *received, uint64_t *sent, void *context) {
	(void)context;
	if (index > (unsigned)INT_MAX) return false;
	int mib[6] = { CTL_NET, PF_LINK, NETLINK_GENERIC, IFMIB_IFDATA, (int)index, IFDATA_GENERAL };
	struct ifmibdata data; size_t length = sizeof(data);
	if (sysctl(mib, 6, &data, &length, NULL, 0) != 0 || length != sizeof(data)) return false;
	memcpy(name, data.ifmd_name, HWMAC_LINK_NAME); *received = data.ifmd_data.ifi_ibytes; *sent = data.ifmd_data.ifi_obytes;
	return true;
}
void hwmac_network_from(source_packet *packet, const struct ifaddrs *list, hwmac_link_counters counters, void *context) {
	uint64_t members[128]; size_t count = 0; bool valid = true;
	for (const struct ifaddrs *item = list; item != NULL; item = item->ifa_next) {
		if (item->ifa_addr == NULL || item->ifa_addr->sa_family != AF_LINK || item->ifa_data == NULL || item->ifa_name == NULL) continue;
		const struct if_data *data = (const struct if_data *)item->ifa_data;
		if (data->ifi_type != IFT_ETHER || strncmp(item->ifa_name, "en", 2) != 0 || item->ifa_name[2] == 0) continue;
		bool digits = true; for (const char *part = item->ifa_name + 2; *part != 0; part++) if (*part < '0' || *part > '9') digits = false;
		if (!digits) continue;
		char *end = NULL; unsigned long index = strtoul(item->ifa_name + 2, &end, 10);
		if (end == NULL || *end != 0 || index > UINT32_MAX) continue;
		uint64_t member = (uint64_t)index; bool duplicate = false;
		for (size_t i = 0; i < count; i++) if (members[i] == member) duplicate = true;
		if (duplicate) continue;
		const struct sockaddr_dl *address = (const struct sockaddr_dl *)(const void *)item->ifa_addr;
		unsigned link_index = item->ifa_addr->sa_len >= offsetof(struct sockaddr_dl, sdl_index) + sizeof(address->sdl_index) ? address->sdl_index : 0;
		char name[HWMAC_LINK_NAME] = {0}; uint64_t received = 0, sent = 0;
		/* Any unreadable eligible link withholds the aggregate. An index reused since getifaddrs reports another name. */
		if (count == 128 || link_index == 0 || !counters(link_index, name, &received, &sent, context) || strncmp(name, item->ifa_name, sizeof(name)) != 0 || UINT64_MAX - packet->network_in < received || UINT64_MAX - packet->network_out < sent) { valid = false; break; }
		members[count++] = member; packet->network_in += received; packet->network_out += sent;
	}
	packet->network_valid = valid && count > 0; packet->network_members = membership(members, count);
}
static void network(source_packet *packet) {
	struct ifaddrs *list = NULL;
	if (getifaddrs(&list) != 0) return;
	hwmac_network_from(packet, list, ifmib_counters, NULL);
	freeifaddrs(list);
}
static bool dictionary_counter(CFDictionaryRef dictionary, CFStringRef key, uint64_t *value) {
	CFTypeRef property = CFDictionaryGetValue(dictionary, key); int64_t number = -1;
	if (property == NULL || CFGetTypeID(property) != CFNumberGetTypeID() || !CFNumberGetValue((CFNumberRef)property, kCFNumberSInt64Type, &number) || number < 0) return false;
	*value = (uint64_t)number; return true;
}
static void storage(source_packet *packet) {
	io_iterator_t iterator = 0;
	if (IOServiceGetMatchingServices(kIOMainPortDefault, IOServiceMatching("IOBlockStorageDriver"), &iterator) != KERN_SUCCESS) return;
	uint64_t members[128]; size_t count = 0; bool valid = true; io_service_t service;
	while ((service = IOIteratorNext(iterator)) != 0) {
		uint64_t identifier = 0, read = 0, written = 0;
		kern_return_t id_status = IORegistryEntryGetRegistryEntryID(service, &identifier);
		CFTypeRef stats = IORegistryEntryCreateCFProperty(service, CFSTR("Statistics"), kCFAllocatorDefault, 0);
		IOObjectRelease(service);
		bool duplicate = false; for (size_t i = 0; i < count; i++) if (members[i] == identifier) duplicate = true;
		bool found = id_status == KERN_SUCCESS && stats != NULL && CFGetTypeID(stats) == CFDictionaryGetTypeID() && dictionary_counter((CFDictionaryRef)stats, CFSTR("Bytes (Read)"), &read) && dictionary_counter((CFDictionaryRef)stats, CFSTR("Bytes (Write)"), &written);
		if (stats != NULL) CFRelease(stats);
		if (duplicate) continue;
		if (!found || count == 128 || UINT64_MAX - packet->storage_read < read || UINT64_MAX - packet->storage_write < written) { valid = false; continue; }
		members[count++] = identifier; packet->storage_read += read; packet->storage_write += written;
	}
	IOObjectRelease(iterator);
	packet->storage_valid = valid && count > 0; packet->storage_members = membership(members, count);
}
void hwmac_collect_public(source_packet *packet) {
	/* This batch is not atomic across APIs. Its oldest possible acquisition
	 * bounds every aggregate, so a late storage call cannot freshen CPU data. */
	double start = hwmac_continuous_ms(), awake_start = hwmac_awake_ms(), wall_start = wall_now(); hwmac_facts(packet);
	CTFontRef font = CTFontCreateWithNameAndOptions(CFSTR("Tahoma-Bold"), 12, NULL, kCTFontOptionsPreventAutoActivation);
	if (font != NULL) { CFStringRef name = CTFontCopyPostScriptName(font); packet->font_available = name != NULL && CFEqual(name, CFSTR("Tahoma-Bold")); if (name != NULL) CFRelease(name); CFRelease(font); }
	mach_port_t host = mach_host_self();
	natural_t cpus = 0; processor_info_array_t info = NULL; mach_msg_type_number_t length = 0;
	if (host_processor_info(host, PROCESSOR_CPU_LOAD_INFO, &cpus, &info, &length) == KERN_SUCCESS) {
		if (cpus > 0 && cpus <= HWMAC_MAX_CPUS && length == cpus * CPU_STATE_MAX) {
			packet->cpu_count = cpus; packet->cpu_valid = true;
			for (unsigned cpu = 0; cpu < cpus; cpu++) for (unsigned state = 0; state < 4; state++) packet->cpu_ticks[cpu][state] = (uint32_t)info[cpu * 4 + state];
		}
		vm_deallocate(mach_task_self(), (vm_address_t)info, (vm_size_t)length * sizeof(integer_t));
	}
	uint64_t total = 0;
	if (sys_number("hw.memsize", &total, sizeof(total))) system_value(packet, "memory-total", "Memory total", "Memory", (double)total);
	vm_size_t page_size = 0; vm_statistics64_data_t vm; mach_msg_type_number_t vm_count = HOST_VM_INFO64_COUNT;
	if (host_page_size(host, &page_size) == KERN_SUCCESS && host_statistics64(host, HOST_VM_INFO64, (host_info64_t)&vm, &vm_count) == KERN_SUCCESS && vm_count == HOST_VM_INFO64_COUNT) {
		system_value(packet, "memory-free", "Memory free", "Memory", (double)vm.free_count * page_size);
		system_value(packet, "memory-active", "Memory active", "Memory", (double)vm.active_count * page_size);
		system_value(packet, "memory-inactive", "Memory inactive", "Memory", (double)vm.inactive_count * page_size);
		system_value(packet, "memory-wired", "Memory wired", "Memory", (double)vm.wire_count * page_size);
		system_value(packet, "memory-compressed", "Memory compressed", "Memory", (double)vm.compressor_page_count * page_size);
	}
	mach_port_deallocate(mach_task_self(), host);
	struct xsw_usage swap;
	if (sys_number("vm.swapusage", &swap, sizeof(swap))) system_value(packet, "swap-used", "Swap used", "Memory", (double)swap.xsu_used);
	struct statfs disk;
	if (statfs("/", &disk) == 0 && disk.f_bsize > 0) {
		system_value(packet, "disk-root-total", "Startup volume total", "Storage", (double)disk.f_blocks * disk.f_bsize);
		system_value(packet, "disk-root-available", "Startup volume available", "Storage", (double)disk.f_bavail * disk.f_bsize);
	}
	network(packet); storage(packet);
	packet->duration_ms = hwmac_continuous_ms() - start;
	packet->continuous_ms = start; packet->awake_ms = awake_start; packet->wall_seconds = wall_start;
	for (unsigned i = 0; i < packet->count; i++) { packet->rows[i].continuous_ms = start; packet->rows[i].wall_seconds = wall_start; }
}
/* NVMe reports the composite temperature in whole kelvin; this is the SI offset, which the Linux NVMe hwmon driver also uses. */
#define HWMAC_KELVIN_OFFSET 273.15
/* A row read by one API call is as old as the start of that call. */
static void observed_at(sensor_row *row, double value, double acquired, double acquired_wall) {
	observed(row, value);
	if (row->valid) { row->continuous_ms = acquired; row->wall_seconds = acquired_wall; row->valid = isfinite(acquired) && isfinite(acquired_wall); }
	if (!row->valid) row->value = NAN;
}
/* 1 when IOPowerSources lists a present internal battery, 0 when it lists none (a desktop), -1 when it cannot answer. */
static int internal_battery(void) {
	CFTypeRef info = IOPSCopyPowerSourcesInfo(); if (info == NULL) return -1;
	CFArrayRef list = IOPSCopyPowerSourcesList(info); int present = list == NULL ? -1 : 0;
	for (CFIndex i = 0; list != NULL && i < CFArrayGetCount(list) && present == 0; i++) {
		CFDictionaryRef description = IOPSGetPowerSourceDescription(info, CFArrayGetValueAtIndex(list, i));
		if (description == NULL) continue;
		CFTypeRef type = CFDictionaryGetValue(description, CFSTR(kIOPSTypeKey)), installed = CFDictionaryGetValue(description, CFSTR(kIOPSIsPresentKey));
		if (type != NULL && CFGetTypeID(type) == CFStringGetTypeID() && CFEqual(type, CFSTR(kIOPSInternalBatteryType)) && installed != NULL && CFGetTypeID(installed) == CFBooleanGetTypeID() && CFBooleanGetValue(installed)) present = 1;
	}
	if (list != NULL) CFRelease(list);
	CFRelease(info); return present;
}
/* A non-negative number from a registry property, or from the BatteryData dictionary where macOS 27 moved the capacities. */
static bool battery_number(io_service_t battery, CFDictionaryRef data, CFStringRef key, uint64_t *value) {
	if (data != NULL && dictionary_counter(data, key, value)) return true;
	CFTypeRef property = IORegistryEntryCreateCFProperty(battery, key, kCFAllocatorDefault, 0); int64_t number = -1;
	bool found = property != NULL && CFGetTypeID(property) == CFNumberGetTypeID() && CFNumberGetValue((CFNumberRef)property, kCFNumberSInt64Type, &number) && number >= 0;
	if (property != NULL) CFRelease(property);
	if (found) *value = (uint64_t)number;
	return found;
}
static void battery(source_packet *packet) {
	int present = internal_battery(); if (present == 0) return;
	sensor_row *cycles = new_row(packet, "battery-cycles", "Battery cycles", "Battery", "count", "cycles");
	sensor_row *health = new_row(packet, "battery-health", "Battery health", "Battery", "percent", "%");
	if (cycles == NULL || health == NULL) { packet->error = 12; return; }
	io_service_t service = present < 0 ? 0 : IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("AppleSmartBattery"));
	if (service == 0) { cycles->error = health->error = 10; return; }
	/* CycleCount is kIOPMPSCycleCountKey. The capacities are read before BatteryData is released. */
	double acquired = hwmac_continuous_ms(), acquired_wall = wall_now(); uint64_t count = 0, nominal = 0, design = 0;
	if (battery_number(service, NULL, CFSTR(kIOPMPSCycleCountKey), &count)) observed_at(cycles, (double)count, acquired, acquired_wall); else cycles->error = 13;
	acquired = hwmac_continuous_ms(); acquired_wall = wall_now();
	CFTypeRef data = IORegistryEntryCreateCFProperty(service, CFSTR("BatteryData"), kCFAllocatorDefault, 0);
	CFDictionaryRef capacities = data != NULL && CFGetTypeID(data) == CFDictionaryGetTypeID() ? (CFDictionaryRef)data : NULL;
	/* Health is the nominal full charge capacity as a percent of design capacity. System Settings' Maximum Capacity uses a method Apple does not publish. */
	if (battery_number(service, capacities, CFSTR("NominalChargeCapacity"), &nominal) && battery_number(service, capacities, CFSTR(kIOPMPSDesignCapacityKey), &design) && nominal > 0 && design > 0) observed_at(health, 100.0 * (double)nominal / (double)design, acquired, acquired_wall);
	else health->error = 13;
	if (data != NULL) CFRelease(data);
	IOObjectRelease(service);
}
static bool internal_drive(io_service_t service) {
	CFTypeRef protocol = IORegistryEntrySearchCFProperty(service, kIOServicePlane, CFSTR(kIOPropertyProtocolCharacteristicsKey), kCFAllocatorDefault, kIORegistryIterateRecursively | kIORegistryIterateParents);
	bool internal = false;
	if (protocol != NULL && CFGetTypeID(protocol) == CFDictionaryGetTypeID()) {
		CFTypeRef location = CFDictionaryGetValue((CFDictionaryRef)protocol, CFSTR(kIOPropertyPhysicalInterconnectLocationKey));
		internal = location != NULL && CFGetTypeID(location) == CFStringGetTypeID() && CFEqual(location, CFSTR(kIOPropertyInternalKey));
	}
	if (protocol != NULL) CFRelease(protocol);
	return internal;
}
/* The internal NVMe drive's SMART composite temperature through the public NVMeSMARTLib plug-in. The user client is opened and closed per read. */
static void drive(source_packet *packet) {
	/* Matching the property alone walks the whole registry (2 to 9 ms on Mac17,9); the NVMe namespace is a block storage device. */
	CFMutableDictionaryRef match = IOServiceMatching("IOBlockStorageDevice");
	CFMutableDictionaryRef property = CFDictionaryCreateMutable(kCFAllocatorDefault, 1, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
	if (match == NULL || property == NULL) { if (match != NULL) CFRelease(match); if (property != NULL) CFRelease(property); return; }
	CFDictionarySetValue(property, CFSTR(kIOPropertyNVMeSMARTCapableKey), kCFBooleanTrue); CFDictionarySetValue(match, CFSTR(kIOPropertyMatchKey), property); CFRelease(property);
	io_iterator_t iterator = 0; io_service_t service, internal = 0; unsigned drives = 0;
	/* IOServiceGetMatchingServices consumes the matching dictionary. */
	if (IOServiceGetMatchingServices(kIOMainPortDefault, match, &iterator) != KERN_SUCCESS) return;
	while ((service = IOIteratorNext(iterator)) != 0) {
		if (internal_drive(service) && drives++ == 0) { internal = service; continue; }
		IOObjectRelease(service);
	}
	IOObjectRelease(iterator);
	if (drives == 0) return;
	sensor_row *row = new_row(packet, "ssd-temperature", "Internal SSD", "Storage", "temperature", "°C");
	if (row == NULL) packet->error = 12;
	/* One key cannot name two internal drives, so a Mac with more than one gets no value instead of an arbitrary one. */
	else if (drives > 1) row->error = 13;
	else {
		IOCFPlugInInterface **plugin = NULL; IONVMeSMARTInterface **smart = NULL; SInt32 score = 0;
		kern_return_t status = IOCreatePlugInInterfaceForService(internal, kIONVMeSMARTUserClientTypeID, kIOCFPlugInInterfaceID, &plugin, &score);
		if (status != KERN_SUCCESS || plugin == NULL) { row->error = 11; row->system_error = status; }
		else {
			HRESULT result = (*plugin)->QueryInterface(plugin, CFUUIDGetUUIDBytes(kIONVMeSMARTInterfaceID), (LPVOID *)&smart);
			if (result != S_OK || smart == NULL) { row->error = 11; row->system_error = result; }
			else {
				NVMeSMARTData data; memset(&data, 0, sizeof(data));
				double acquired = hwmac_continuous_ms(), acquired_wall = wall_now();
				IOReturn read = (*smart)->SMARTReadData(smart, &data); uint16_t kelvin = data.TEMPERATURE;
				/* Zero kelvin means the drive reports no temperature. */
				if (read != kIOReturnSuccess) { row->error = 3; row->system_error = read; }
				else if (kelvin == 0) row->error = 13;
				else observed_at(row, (double)kelvin - HWMAC_KELVIN_OFFSET, acquired, acquired_wall);
				(*smart)->Release(smart);
			}
			IODestroyPlugInInterface(plugin);
		}
	}
	IOObjectRelease(internal);
}
void hwmac_collect_health(source_packet *packet) {
	double start = hwmac_continuous_ms(); hwmac_facts(packet);
	battery(packet); drive(packet);
	packet->continuous_ms = hwmac_continuous_ms(); packet->awake_ms = hwmac_awake_ms(); packet->wall_seconds = wall_now(); packet->duration_ms = packet->continuous_ms - start;
}
