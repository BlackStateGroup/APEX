# Verification record

This branch contains the research and design baseline. Source inspection has pinned 28 upstream repositories to exact commits, read their README/licensing material and recorded file-level caveats in research/upstreams.json. No upstream firmware binary was run and no physical hardware was tested.

Implementation evidence is added on the dependent foundation branch. Its report must distinguish portable host tests, JavaScript/TypeScript builds, native Android compilation, ESP-IDF cross-compilation and actual hardware execution. A source file, generated project or bundle is not a substitute for an APK, flashed target or measured hardware result.

Release gates and acceptance conditions are defined in ENGINEERING_WORK_PACKAGES.md. All device compatibility and physical-operation claims remain unverified until backed by named fixtures and retained results.
