ARG FEX_PKG=ghcr.io/virtudude/armada-packages/fex:latest
ARG MESA_PKG=ghcr.io/virtudude/armada-packages/mesa:latest
ARG MANGOHUD_PKG=ghcr.io/virtudude/armada-packages/mangohud:latest
ARG GAMESCOPE_PKG=ghcr.io/virtudude/armada-packages/gamescope:latest
ARG KERNEL_PKG=ghcr.io/virtudude/armada-packages/kernel:latest
ARG INPUTPLUMBER_PKG=ghcr.io/virtudude/armada-packages/inputplumber:latest
ARG EXTEST_PKG=ghcr.io/virtudude/armada-packages/extest:latest

FROM ${FEX_PKG} AS fex
FROM ${MESA_PKG} AS mesa
FROM ${MANGOHUD_PKG} AS mangohud
FROM ${GAMESCOPE_PKG} AS gamescope
FROM ${KERNEL_PKG} AS kernel
FROM ${INPUTPLUMBER_PKG} AS inputplumber
FROM ${EXTEST_PKG} AS extest

FROM scratch AS ctx
COPY build_files /build_files/
COPY system_files /system_files/

FROM quay.io/fedora/fedora-bootc:44

RUN --mount=type=bind,from=ctx,source=/,target=/ctx \
    --mount=type=bind,from=fex,source=/rpms,target=/packages/fex \
    --mount=type=bind,from=mesa,source=/rpms,target=/packages/mesa \
    --mount=type=bind,from=mangohud,source=/rpms,target=/packages/mangohud \
    --mount=type=bind,from=gamescope,source=/rpms,target=/packages/gamescope \
    --mount=type=bind,from=kernel,source=/kernel,target=/packages/kernel \
    --mount=type=bind,from=inputplumber,source=/,target=/packages/inputplumber \
    --mount=type=bind,from=extest,source=/,target=/packages/extest \
    --mount=type=cache,dst=/var/cache \
    --mount=type=cache,dst=/var/log \
    --mount=type=tmpfs,dst=/tmp \
    /ctx/build_files/build.sh

RUN bootc container lint
