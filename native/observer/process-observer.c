/* Development-only observer using public macOS SDK headers. Never packaged. */
#include <libproc.h>
#include <sys/proc_info.h>
#include <sys/resource.h>
#include <mach/mach_time.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <inttypes.h>
#include <errno.h>
#include <limits.h>
#include <string.h>
#include <time.h>
static int fail(const char *where) { printf("{\"ok\":false,\"phase\":\"%s\",\"errno\":%d}\n", where, errno); return 2; }
static void string(const char *text) { putchar('"'); for (const unsigned char *p=(const unsigned char *)text; *p; p++) { if (*p=='"'||*p=='\\') printf("\\%c",*p); else if (*p<32) printf("\\u%04x",*p); else putchar(*p); } putchar('"'); }
int main(int argc, char **argv) {
	if (argc!=2) return 2;
	char *end=NULL;errno=0;long value=strtol(argv[1],&end,10);
	if(errno||!end||*end||value<=0||value>INT_MAX)return 2;
	int pid=(int)value;struct proc_bsdinfo before={0},after={0};struct proc_taskinfo task={0};struct rusage_info_v2 usage={0};
	if(proc_pidinfo(pid,PROC_PIDTBSDINFO,0,&before,sizeof(before))!=(int)sizeof(before))return fail("identity-before");
	if(proc_pid_rusage(pid,RUSAGE_INFO_V2,(rusage_info_t *)&usage)!=0)return fail("rusage");
	if(proc_pidinfo(pid,PROC_PIDTASKINFO,0,&task,sizeof(task))!=(int)sizeof(task))return fail("task-info");
	char executable[PROC_PIDPATHINFO_MAXSIZE]={0};if(proc_pidpath(pid,executable,sizeof(executable))<=0)return fail("executable");
	int capacity=proc_pidinfo(pid,PROC_PIDLISTFDS,0,NULL,0);if(capacity<=0||capacity>8*1024*1024)return fail("fd-size");
	capacity+=128*(int)sizeof(struct proc_fdinfo);void *fds=malloc((size_t)capacity);if(!fds)return fail("fd-allocation");
	int size=proc_pidinfo(pid,PROC_PIDLISTFDS,0,fds,capacity);free(fds);
	if(size<0||size>=capacity||size%(int)sizeof(struct proc_fdinfo))return fail("fd-read");
	if(proc_pidinfo(pid,PROC_PIDTBSDINFO,0,&after,sizeof(after))!=(int)sizeof(after))return fail("identity-after");
	if(before.pbi_pid!=after.pbi_pid||before.pbi_start_tvsec!=after.pbi_start_tvsec||before.pbi_start_tvusec!=after.pbi_start_tvusec){errno=ESRCH;return fail("identity-changed");}
	mach_timebase_info_data_t timebase={0};if(mach_timebase_info(&timebase)!=0||!timebase.denom)return fail("clock");
	double scale=(double)timebase.numer/timebase.denom/1e6;struct timespec wall={0};if(clock_gettime(CLOCK_REALTIME,&wall))return fail("wall-clock");
	printf("{\"ok\":true,\"pid\":%d,\"parentPid\":%u,\"startSeconds\":%" PRIu64 ",\"startMicroseconds\":%" PRIu64 ",\"executable\":",pid,before.pbi_ppid,before.pbi_start_tvsec,before.pbi_start_tvusec);string(executable);
	printf(",\"wallMs\":%.3f,\"continuousMs\":%.6f,\"awakeMs\":%.6f,\"rssBytes\":%" PRIu64 ",\"footprintBytes\":%" PRIu64 ",\"cpuUserNs\":%" PRIu64 ",\"cpuSystemNs\":%" PRIu64 ",\"idleWakeups\":%" PRIu64 ",\"interruptWakeups\":%" PRIu64 ",\"threads\":%d,\"fileDescriptors\":%zu}\n",wall.tv_sec*1000.0+wall.tv_nsec/1e6,mach_continuous_time()*scale,mach_absolute_time()*scale,usage.ri_resident_size,usage.ri_phys_footprint,(uint64_t)(usage.ri_user_time*scale*1e6),(uint64_t)(usage.ri_system_time*scale*1e6),usage.ri_pkg_idle_wkups,usage.ri_interrupt_wkups,task.pti_threadnum,(size_t)size/sizeof(struct proc_fdinfo));
	return 0;
}
