{
  "targets": [{
    "target_name": "hwmac",
    "sources": ["addon.c", "collectors.c", "smc.c"],
    "include_dirs": ["../../build/native/generated"],
    "defines": ["NAPI_VERSION=8"],
    "cflags": ["-Wall", "-Wextra", "-Werror", "-std=c11"],
    "xcode_settings": {"MACOSX_DEPLOYMENT_TARGET": "13.5", "GCC_TREAT_WARNINGS_AS_ERRORS": "YES", "OTHER_CFLAGS": ["-Wall", "-Wextra", "-std=c11", "-fvisibility=hidden"]},
    "libraries": ["-framework CoreFoundation", "-framework CoreText", "-framework IOKit"]
  }]
}
