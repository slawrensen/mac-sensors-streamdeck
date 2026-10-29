#define NAPI_VERSION 8
#include <node_api.h>
#include "version.h"
#include "source-id.h"
#include "collectors.h"
#include "smc.h"
#include <stdatomic.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>
#include <time.h>

#ifndef HWMAC_TEST_BUILD
#define HWMAC_TEST_BUILD 0
#endif
#if defined(__aarch64__)
#define HWMAC_ARCH "arm64"
#elif defined(__x86_64__)
#define HWMAC_ARCH "x64"
#else
#error Unsupported artifact architecture
#endif

#define HWMAC_STRING_INNER(value) #value
#define HWMAC_STRING(value) HWMAC_STRING_INNER(value)
/* Independent packaging metadata is signed with the rest of this Mach-O. */
__attribute__((used, section("__TEXT,__hwmac_meta")))
static const char HWMAC_METADATA[] =
	"{\"protocol\":" HWMAC_STRING(HWMAC_PROTOCOL_VERSION)
	",\"napi\":8,\"version\":\"" HWMAC_NATIVE_VERSION
	"\",\"sourceId\":\"" HWMAC_SOURCE_ID
	"\",\"arch\":\"" HWMAC_ARCH
	"\",\"platform\":\"darwin\",\"testHooks\":" HWMAC_STRING(HWMAC_TEST_BUILD) "}";

typedef struct module_state module_state;
typedef struct session session;
typedef struct read_job read_job;
typedef struct { unsigned delay_ms; int fault; double value; } fake_source;
/* Read slots by index. A new name here is additive: the loader pairs JS and native by sourceId, so a peer never sees an unknown name. */
#define HWMAC_SOURCES 3
static const char *const SOURCE_NAMES[HWMAC_SOURCES] = { "public", "smc", "health" };
struct module_state {
	napi_env env;
	napi_async_cleanup_hook_handle hook;
	unsigned references;
	bool closing;
	read_job *pending[HWMAC_SOURCES];
	fake_source fake[HWMAC_SOURCES];
	unsigned fake_revision;
};
struct session {
	module_state *state;
	unsigned references, jobs;
	atomic_bool closed;
	smc_context smc;
};
struct read_job {
	module_state *state;
	session *owner;
	unsigned source;
	napi_async_work work;
	napi_deferred deferred;
	napi_ref owner_ref;
	fake_source fake;
	unsigned revision;
	source_packet packet;
};
static const napi_type_tag SESSION_TAG = { UINT64_C(0x6dda082377f34b53), UINT64_C(0x8c42e1ce6437961a) };
static napi_value undefined_value(napi_env env) { napi_value value = NULL; napi_get_undefined(env, &value); return value; }
static napi_value string_value(napi_env env, const char *text) { napi_value value = NULL; napi_create_string_utf8(env, text, NAPI_AUTO_LENGTH, &value); return value; }
static napi_value number_value(napi_env env, double number) { napi_value value = NULL; napi_create_double(env, number, &value); return value; }
static void set_string(napi_env env, napi_value object, const char *key, const char *text) { napi_set_named_property(env, object, key, string_value(env, text)); }
static void set_number(napi_env env, napi_value object, const char *key, double number) { napi_set_named_property(env, object, key, number_value(env, number)); }
static void set_bool(napi_env env, napi_value object, const char *key, bool boolean) { napi_value value; napi_get_boolean(env, boolean, &value); napi_set_named_property(env, object, key, value); }
static void set_u64(napi_env env, napi_value object, const char *key, uint64_t number) { char text[24]; snprintf(text, sizeof(text), "%llu", (unsigned long long)number); set_string(env, object, key, text); }
static napi_value error_value(napi_env env, const char *code, const char *operation, const char *message) {
	napi_value error = NULL;
	napi_create_error(env, string_value(env, code), string_value(env, message), &error);
	if (error != NULL) { set_string(env, error, "operation", operation); set_number(env, error, "systemCode", 0); }
	return error;
}
static napi_value fail(napi_env env, const char *code, const char *operation, const char *message) {
	napi_value error = error_value(env, code, operation, message);
	if (error != NULL) napi_throw(env, error);
	return NULL;
}
#define CHECK(call) do { if ((call) != napi_ok) return fail(env, "HWMAC_ARGUMENT", "arguments", "Invalid native API argument."); } while (0)
static void state_release(module_state *state) { if (--state->references == 0) free(state); }
static void session_release(session *owner) {
	if (--owner->references == 0) { hwmac_close_smc(&owner->smc); state_release(owner->state); free(owner); }
}
static void maybe_finish_cleanup(module_state *state) {
	bool idle = true; for (unsigned i = 0; i < HWMAC_SOURCES; i++) if (state->pending[i] != NULL) idle = false;
	if (state->closing && idle && state->hook != NULL) {
		napi_async_cleanup_hook_handle hook = state->hook; state->hook = NULL;
		napi_remove_async_cleanup_hook(hook); state_release(state);
	}
}
static void cleanup(napi_async_cleanup_hook_handle hook, void *data) {
	module_state *state = data; state->closing = true; state->hook = hook;
	for (unsigned i = 0; i < HWMAC_SOURCES; i++) if (state->pending[i] != NULL) {
		atomic_store(&state->pending[i]->owner->closed, true);
		/* Only queued work can be cancelled. Running calls retain their owner. */
		napi_cancel_async_work(state->env, state->pending[i]->work);
	}
	maybe_finish_cleanup(state);
}
static void finalize_state(napi_env env, void *data, void *hint) { (void)env; (void)hint; state_release(data); }
static void finalize_session(napi_env env, void *data, void *hint) {
	(void)env; (void)hint; session *owner = data; atomic_store(&owner->closed, true); session_release(owner);
}
static session *receiver(napi_env env, napi_value self) {
	bool match = false; session *owner = NULL;
	if (napi_check_object_type_tag(env, self, &SESSION_TAG, &match) != napi_ok || !match || napi_unwrap(env, self, (void **)&owner) != napi_ok || owner == NULL) {
		fail(env, "HWMAC_RECEIVER", "session", "Expected a native sensor session."); return NULL;
	}
	return owner;
}
static const char *source_error_code(int code) {
	switch (code) {
		case 0: return "HWMAC_OK";
		case 1: return "HWMAC_COMMAND";
		case 2: return "HWMAC_SIZE";
		case 3: return "HWMAC_TRANSPORT";
		case 4: return "HWMAC_REPLY_LENGTH";
		case 5: return "HWMAC_FIRMWARE";
		case 10: return "HWMAC_NO_SERVICE";
		case 11: return "HWMAC_OPEN";
		case 12: return "HWMAC_BOUNDS";
		default: return "HWMAC_VALUE";
	}
}
static napi_value packet_value(napi_env env, const read_job *job) {
	const source_packet *packet = &job->packet; napi_value result, rows, cpu;
	napi_create_object(env, &result); napi_create_array_with_length(env, packet->count, &rows);
	set_string(env, result, "source", SOURCE_NAMES[job->source]);
	set_number(env, result, "continuousMs", packet->continuous_ms); set_number(env, result, "awakeMs", packet->awake_ms);
	set_number(env, result, "wallSeconds", packet->wall_seconds); set_number(env, result, "durationMs", packet->duration_ms);
	set_string(env, result, "code", source_error_code(packet->error));
	set_number(env, result, "error", packet->error); set_number(env, result, "systemCode", (double)packet->system_error);
	set_string(env, result, "operation", job->source == 0 ? "public.read" : job->source == 2 ? "health.read" : packet->error == 10 ? "smc.matchService" : packet->error == 11 ? "smc.open" : "smc.read");
	set_string(env, result, "model", packet->model); set_string(env, result, "chip", packet->chip);
	set_number(env, result, "appleSilicon", packet->apple_silicon); set_number(env, result, "translated", packet->translated); set_number(env, result, "translationError", packet->translation_error);
	set_bool(env, result, "fontAvailable", packet->font_available);
	for (unsigned i = 0; i < packet->count; i++) {
		const sensor_row *row = &packet->rows[i]; napi_value object; napi_create_object(env, &object);
		set_string(env, object, "key", row->key); set_string(env, object, "label", row->label); set_string(env, object, "group", row->group);
		set_string(env, object, "kind", row->kind); set_string(env, object, "unit", row->unit);
		set_bool(env, object, "valid", row->valid); set_number(env, object, "value", row->value);
		set_number(env, object, "continuousMs", row->continuous_ms); set_number(env, object, "wallSeconds", row->wall_seconds);
		set_string(env, object, "code", source_error_code(row->error != 0 ? row->error : row->valid ? 0 : 13));
		set_number(env, object, "error", row->error); set_number(env, object, "systemCode", (double)row->system_error);
		set_number(env, object, "firmwareCode", row->firmware_error); set_string(env, object, "operation", job->source == 2 ? "health.read" : row->operation == 9 ? "smc.keyInfo" : row->operation == 5 ? "smc.read" : "public.read");
		napi_set_element(env, rows, i, object);
	}
	napi_set_named_property(env, result, "rows", rows);
	napi_create_array_with_length(env, packet->cpu_count, &cpu);
	for (unsigned i = 0; i < packet->cpu_count; i++) {
		napi_value states; napi_create_array_with_length(env, 4, &states);
		for (unsigned j = 0; j < 4; j++) napi_set_element(env, states, j, number_value(env, packet->cpu_ticks[i][j]));
		napi_set_element(env, cpu, i, states);
	}
	napi_set_named_property(env, result, "cpuTicks", cpu); set_bool(env, result, "cpuValid", packet->cpu_valid);
	set_bool(env, result, "networkValid", packet->network_valid); set_u64(env, result, "networkIn", packet->network_in); set_u64(env, result, "networkOut", packet->network_out); set_u64(env, result, "networkMembers", packet->network_members);
	set_bool(env, result, "storageValid", packet->storage_valid); set_u64(env, result, "storageRead", packet->storage_read); set_u64(env, result, "storageWrite", packet->storage_write); set_u64(env, result, "storageMembers", packet->storage_members);
	return result;
}
static void execute_read(napi_env env, void *data) {
	(void)env; read_job *job = data;
#if HWMAC_TEST_BUILD
	if (job->fake.delay_ms != 0) { struct timespec delay = { job->fake.delay_ms / 1000, (long)(job->fake.delay_ms % 1000) * 1000000 }; nanosleep(&delay, NULL); }
	source_packet *packet = &job->packet;
	snprintf(packet->model, sizeof(packet->model), "Mac17,9"); snprintf(packet->chip, sizeof(packet->chip), "t6050");
	packet->apple_silicon = 1; packet->font_available = job->fake.fault != 4;
	/* Fixture data was acquired when the job copied its configured values. */
	if (job->fake.fault == 1) { packet->error = 10; return; }
	static const char *const FAKE_ROWS[HWMAC_SOURCES][5] = {
		{ "memory-total", "Memory total", "Memory", "other", "B" },
		{ "TB1T", "Battery", "Battery", "temperature", "°C" },
		{ "battery-cycles", "Battery cycles", "Battery", "count", "cycles" }
	};
	const char *const *fixture = FAKE_ROWS[job->source];
	packet->count = 1; sensor_row *row = &packet->rows[0];
	snprintf(row->key, sizeof(row->key), "%s", fixture[0]); snprintf(row->label, sizeof(row->label), "%s", fixture[1]);
	snprintf(row->group, sizeof(row->group), "%s", fixture[2]); snprintf(row->kind, sizeof(row->kind), "%s", fixture[3]);
	snprintf(row->unit, sizeof(row->unit), "%s", fixture[4]);
	row->value = job->fake.fault == 2 ? NAN : job->fake.fault == 3 ? 1e30 : job->fake.value;
	row->valid = job->fake.fault != 5; row->continuous_ms = packet->continuous_ms; row->wall_seconds = packet->wall_seconds;
	packet->cpu_valid = true; packet->cpu_count = 1;
	packet->cpu_ticks[0][0] = 10 * job->revision; packet->cpu_ticks[0][2] = 20 * job->revision;
	packet->network_valid = packet->storage_valid = true;
	packet->network_in = 1000 * job->revision; packet->network_out = 500 * job->revision;
	packet->storage_read = 2000 * job->revision; packet->storage_write = 1000 * job->revision;
	packet->network_members = packet->storage_members = 1;
	packet->duration_ms = hwmac_continuous_ms() - packet->continuous_ms;
#else
	if (job->source == 0) hwmac_collect_public(&job->packet);
	else if (job->source == 2) hwmac_collect_health(&job->packet);
	else hwmac_collect_smc(&job->owner->smc, &job->packet);
#endif
}
static void complete_read(napi_env env, napi_status status, void *data) {
	read_job *job = data; module_state *state = job->state; session *owner = job->owner;
	if (state->pending[job->source] == job) state->pending[job->source] = NULL;
	owner->jobs--;
	if (env != NULL && !state->closing) {
		if (status == napi_cancelled || atomic_load(&owner->closed)) napi_reject_deferred(env, job->deferred, error_value(env, "HWMAC_CLOSED", "read", "The sensor session has closed."));
		else if (status != napi_ok) napi_reject_deferred(env, job->deferred, error_value(env, "HWMAC_ASYNC", "read", "The native read did not complete."));
		else napi_resolve_deferred(env, job->deferred, packet_value(env, job));
	}
	if (atomic_load(&owner->closed) && owner->jobs == 0) hwmac_close_smc(&owner->smc);
	if (env != NULL) { napi_delete_reference(env, job->owner_ref); napi_delete_async_work(env, job->work); }
	/* The session and state remain retained until after cleanup bookkeeping. */
	maybe_finish_cleanup(state); session_release(owner); free(job);
}
static napi_value read_source(napi_env env, napi_callback_info info) {
	size_t argc = 2; napi_value argv[2], self; CHECK(napi_get_cb_info(env, info, &argc, argv, &self, NULL));
	session *owner = receiver(env, self); if (owner == NULL) return NULL;
	if (argc != 1) return fail(env, "HWMAC_ARGUMENT", "read", "Read expects one source name.");
	char source[16]; size_t length = 0; CHECK(napi_get_value_string_utf8(env, argv[0], source, sizeof(source), &length));
	unsigned index = HWMAC_SOURCES;
	for (unsigned i = 0; i < HWMAC_SOURCES; i++) if (length == strlen(SOURCE_NAMES[i]) && memcmp(source, SOURCE_NAMES[i], length) == 0) index = i;
	if (index == HWMAC_SOURCES) return fail(env, "HWMAC_ARGUMENT", "read", "Unknown sensor source.");
	module_state *state = owner->state;
	if (atomic_load(&owner->closed) || state->closing) return fail(env, "HWMAC_CLOSED", "read", "The sensor session has closed.");
	if (state->pending[index] != NULL) return fail(env, "HWMAC_BUSY", "read", "This source already has a pending read.");
	read_job *job = calloc(1, sizeof(*job)); if (job == NULL) return fail(env, "HWMAC_MEMORY", "read", "Native allocation failed.");
	job->state = state; job->owner = owner; job->source = index; job->fake = state->fake[index]; job->revision = ++state->fake_revision;
#if HWMAC_TEST_BUILD
	job->packet.continuous_ms = hwmac_continuous_ms(); job->packet.awake_ms = hwmac_awake_ms();
	struct timespec acquisition; job->packet.wall_seconds = clock_gettime(CLOCK_REALTIME, &acquisition) == 0 ? (double)acquisition.tv_sec + (double)acquisition.tv_nsec / 1e9 : NAN;
#endif
	napi_value promise = NULL; napi_status status = napi_create_promise(env, &job->deferred, &promise);
	if (status == napi_ok) status = napi_create_reference(env, self, 1, &job->owner_ref);
	if (status == napi_ok) status = napi_create_async_work(env, NULL, string_value(env, "MacSensorsRead"), execute_read, complete_read, job, &job->work);
	if (status == napi_ok) { owner->references++; owner->jobs++; state->pending[index] = job; status = napi_queue_async_work(env, job->work); }
	if (status != napi_ok) {
		if (state->pending[index] == job) { state->pending[index] = NULL; owner->jobs--; owner->references--; }
		if (job->owner_ref != NULL) napi_delete_reference(env, job->owner_ref);
		if (job->work != NULL) napi_delete_async_work(env, job->work);
		free(job); return fail(env, "HWMAC_ASYNC", "read", "Could not queue a native read.");
	}
	return promise;
}
static napi_value close_session(napi_env env, napi_callback_info info) {
	size_t argc = 1; napi_value argument, self; CHECK(napi_get_cb_info(env, info, &argc, &argument, &self, NULL));
	if (argc != 0) return fail(env, "HWMAC_ARGUMENT", "close", "Close accepts no arguments.");
	session *owner = receiver(env, self); if (owner == NULL) return NULL;
	atomic_store(&owner->closed, true);
	for (unsigned i = 0; i < HWMAC_SOURCES; i++) if (owner->state->pending[i] != NULL && owner->state->pending[i]->owner == owner) napi_cancel_async_work(env, owner->state->pending[i]->work);
	if (owner->jobs == 0) hwmac_close_smc(&owner->smc);
	return undefined_value(env);
}
static napi_value open_session(napi_env env, napi_callback_info info) {
	size_t argc = 1; napi_value argument; CHECK(napi_get_cb_info(env, info, &argc, &argument, NULL, NULL));
	if (argc != 0) return fail(env, "HWMAC_ARGUMENT", "open", "Open accepts no arguments.");
	module_state *state; CHECK(napi_get_instance_data(env, (void **)&state));
	if (state->closing) return fail(env, "HWMAC_CLOSED", "open", "The native environment is closing.");
	session *owner = calloc(1, sizeof(*owner)); if (owner == NULL) return fail(env, "HWMAC_MEMORY", "open", "Native allocation failed.");
	owner->state = state; owner->references = 1; state->references++; atomic_init(&owner->closed, false);
	napi_value object; napi_status status = napi_create_object(env, &object);
	if (status == napi_ok) status = napi_type_tag_object(env, object, &SESSION_TAG);
	napi_property_descriptor methods[] = {
		{ "read", NULL, read_source, NULL, NULL, NULL, napi_default, NULL },
		{ "close", NULL, close_session, NULL, NULL, NULL, napi_default, NULL }
	};
	if (status == napi_ok) status = napi_define_properties(env, object, 2, methods);
	if (status == napi_ok) status = napi_wrap(env, object, owner, finalize_session, NULL, NULL);
	if (status != napi_ok) { session_release(owner); return fail(env, "HWMAC_API", "open", "Could not create native session."); }
	return object;
}
static napi_value build_info(napi_env env, napi_callback_info info) {
	(void)info; napi_value result; CHECK(napi_create_object(env, &result));
	set_number(env, result, "protocol", HWMAC_PROTOCOL_VERSION); set_number(env, result, "napi", HWMAC_NAPI_VERSION);
	set_string(env, result, "version", HWMAC_NATIVE_VERSION); set_string(env, result, "sourceId", HWMAC_SOURCE_ID);
	set_string(env, result, "arch", HWMAC_ARCH); set_string(env, result, "platform", "darwin"); set_bool(env, result, "testHooks", HWMAC_TEST_BUILD != 0);
	return result;
}
static napi_value now_value(napi_env env, napi_callback_info info) { (void)info; return number_value(env, hwmac_continuous_ms()); }
#if HWMAC_TEST_BUILD
static napi_value configure(napi_env env, napi_callback_info info) {
	size_t argc = 1; napi_value args[1]; CHECK(napi_get_cb_info(env, info, &argc, args, NULL, NULL));
	if (argc != 1) return fail(env, "HWMAC_ARGUMENT", "configure", "Fixture object required.");
	module_state *state; CHECK(napi_get_instance_data(env, (void **)&state));
	for (unsigned i = 0; i < HWMAC_SOURCES; i++) {
		napi_value source; bool present; const char *key = SOURCE_NAMES[i];
		CHECK(napi_has_named_property(env, args[0], key, &present)); if (!present) continue; CHECK(napi_get_named_property(env, args[0], key, &source));
		const char *names[] = { "delayMs", "fault", "value" };
		for (unsigned j = 0; j < 3; j++) {
			CHECK(napi_has_named_property(env, source, names[j], &present)); if (!present) continue;
			napi_value value; double number; CHECK(napi_get_named_property(env, source, names[j], &value)); CHECK(napi_get_value_double(env, value, &number));
			if (!isfinite(number)) return fail(env, "HWMAC_ARGUMENT", "configure", "Finite fixture value required.");
			if (j == 0) { if (number < 0 || number > 5000 || floor(number) != number) return fail(env, "HWMAC_ARGUMENT", "configure", "Delay outside fixture bound."); state->fake[i].delay_ms = (unsigned)number; }
			if (j == 1) { if (number < 0 || number > 5 || floor(number) != number) return fail(env, "HWMAC_ARGUMENT", "configure", "Unknown fixture fault."); state->fake[i].fault = (int)number; }
			if (j == 2) state->fake[i].value = number;
		}
	}
	return undefined_value(env);
}
static _Thread_local unsigned transport_calls;
static _Thread_local size_t fake_reply_length = 80;
static _Thread_local kern_return_t fake_system_status;
static _Thread_local uint8_t fake_firmware_status;
static kern_return_t fake_transport(io_connect_t connection, uint32_t selector, const void *request, size_t size, void *reply, size_t *length) {
	(void)connection; (void)selector; (void)request; (void)size; transport_calls++; memset(reply, 0, *length); ((uint8_t *)reply)[40] = fake_firmware_status; *length = fake_reply_length; return fake_system_status;
}
static napi_value test_command(napi_env env, napi_callback_info info) {
	size_t argc = 1; napi_value args[1]; CHECK(napi_get_cb_info(env, info, &argc, args, NULL, NULL));
	double command; if (argc != 1) return fail(env, "HWMAC_ARGUMENT", "testCommand", "Command required."); CHECK(napi_get_value_double(env, args[0], &command));
	if (command < 0 || command > 255 || !isfinite(command) || floor(command) != command) return fail(env, "HWMAC_ARGUMENT", "testCommand", "Byte required.");
	uint8_t reply[80]; transport_calls = 0; fake_reply_length = 80; fake_system_status = 0; fake_firmware_status = 0; smc_result result = smc_read_request(0, (uint8_t)command, 0, 4, 0, reply, fake_transport);
	napi_value object; CHECK(napi_create_object(env, &object)); set_number(env, object, "error", result.code); set_number(env, object, "transportCalls", transport_calls); return object;
}
static napi_value test_transport_result(napi_env env, napi_callback_info info) {
	size_t argc = 3; napi_value args[3]; CHECK(napi_get_cb_info(env, info, &argc, args, NULL, NULL));
	if (argc != 3) return fail(env, "HWMAC_ARGUMENT", "testTransport", "Length, system status and firmware status required.");
	uint32_t length, system_status, firmware; CHECK(napi_get_value_uint32(env, args[0], &length)); CHECK(napi_get_value_uint32(env, args[1], &system_status)); CHECK(napi_get_value_uint32(env, args[2], &firmware));
	fake_reply_length = length; fake_system_status = (kern_return_t)system_status; fake_firmware_status = (uint8_t)firmware;
	uint8_t reply[80]; smc_result result = smc_read_request(0, 5, 0, 4, 0, reply, fake_transport);
	napi_value object; CHECK(napi_create_object(env, &object)); set_number(env, object, "error", result.code); set_number(env, object, "systemCode", result.system_code); set_number(env, object, "firmwareCode", result.firmware_code);
	fake_reply_length = 80; fake_system_status = 0; fake_firmware_status = 0; return object;
}
static napi_value test_catalog(napi_env env, napi_callback_info info) {
	size_t argc = 3; napi_value args[3]; CHECK(napi_get_cb_info(env, info, &argc, args, NULL, NULL));
	if (argc != 3) return fail(env, "HWMAC_ARGUMENT", "testCatalog", "Model, chip and family required.");
	char model[128], chip[64]; size_t length; int32_t family;
	CHECK(napi_get_value_string_utf8(env, args[0], model, sizeof(model), &length)); CHECK(napi_get_value_string_utf8(env, args[1], chip, sizeof(chip), &length)); CHECK(napi_get_value_int32(env, args[2], &family));
	napi_value object; CHECK(napi_create_object(env, &object)); set_bool(env, object, "common", hwmac_catalog_applies(0, model, chip, family)); set_bool(env, object, "apple", hwmac_catalog_applies(1, model, chip, family)); set_bool(env, object, "m5", hwmac_catalog_applies(5, model, chip, family)); return object;
}
static napi_value test_decode(napi_env env, napi_callback_info info) {
	size_t argc = 2; napi_value args[2]; CHECK(napi_get_cb_info(env, info, &argc, args, NULL, NULL));
	if (argc != 2) return fail(env, "HWMAC_ARGUMENT", "testDecode", "Type and buffer required.");
	char type[5]; size_t length; CHECK(napi_get_value_string_utf8(env, args[0], type, sizeof(type), &length));
	if (length != 4) return fail(env, "HWMAC_ARGUMENT", "testDecode", "Four-byte type required.");
	void *bytes; size_t size; CHECK(napi_get_buffer_info(env, args[1], &bytes, &size));
	double value; if (size > 32 || !smc_decode(smc_key(type), (uint32_t)size, bytes, &value)) { napi_value none; napi_get_null(env, &none); return none; }
	return number_value(env, value);
}
#endif
NAPI_MODULE_INIT() {
	module_state *state = calloc(1, sizeof(*state)); if (state == NULL) return fail(env, "HWMAC_MEMORY", "initialize", "Native allocation failed.");
	state->env = env; state->references = 2; state->fake[0].value = 68719476736.0; state->fake[1].value = 30.0; state->fake[2].value = 82.0;
	napi_status status = napi_set_instance_data(env, state, finalize_state, NULL);
	if (status != napi_ok) { free(state); return fail(env, "HWMAC_API", "initialize", "Could not register native state."); }
	status = napi_add_async_cleanup_hook(env, cleanup, state, &state->hook);
	if (status != napi_ok) { state->references--; return fail(env, "HWMAC_API", "initialize", "Could not register native cleanup."); }
	napi_property_descriptor methods[] = {
		{ "getBuildInfo", NULL, build_info, NULL, NULL, NULL, napi_default, NULL },
		{ "now", NULL, now_value, NULL, NULL, NULL, napi_default, NULL },
		{ "open", NULL, open_session, NULL, NULL, NULL, napi_default, NULL },
#if HWMAC_TEST_BUILD
		{ "configure", NULL, configure, NULL, NULL, NULL, napi_default, NULL },
		{ "testCommand", NULL, test_command, NULL, NULL, NULL, napi_default, NULL },
		{ "testDecode", NULL, test_decode, NULL, NULL, NULL, napi_default, NULL },
		{ "testTransport", NULL, test_transport_result, NULL, NULL, NULL, napi_default, NULL },
		{ "testCatalog", NULL, test_catalog, NULL, NULL, NULL, napi_default, NULL },
#endif
	};
	CHECK(napi_define_properties(env, exports, sizeof(methods) / sizeof(methods[0]), methods));
	return exports;
}
