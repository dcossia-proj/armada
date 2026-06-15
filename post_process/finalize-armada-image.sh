#!/bin/bash
# Post-BIB: stage ROCKNIX ABL files and compress.

set -euxo pipefail

RAW_IMAGE="${1:-output/raw/disk.raw}"
ROCKNIX_ABL_VERSION="${ROCKNIX_ABL_VERSION:-v1.1.1}"
OUT="${OUT:-output/armada-$(TZ='America/New_York' date +%Y%m%d).img.gz}"
REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

if [[ ! -f "${RAW_IMAGE}" ]]; then
    echo "ERROR: raw image not found at ${RAW_IMAGE}"
    echo "Run 'just build-raw' first."
    exit 1
fi

WORK=$(mktemp -d)
trap "sudo umount '${WORK}/mnt' 2>/dev/null || true; sudo losetup -d \"\$(cat ${WORK}/loop 2>/dev/null)\" 2>/dev/null || true; rm -rf '${WORK}'" EXIT

curl -fsSL -o "${WORK}/abl.tar.gz" \
    "https://github.com/ROCKNIX/abl/releases/download/${ROCKNIX_ABL_VERSION}/rocknix-abl-${ROCKNIX_ABL_VERSION}.tar.gz"
mkdir -p "${WORK}/abl-extracted"
tar -xzf "${WORK}/abl.tar.gz" -C "${WORK}/abl-extracted"

LOOP=$(sudo losetup -fP --show "${RAW_IMAGE}")
echo "${LOOP}" > "${WORK}/loop"
sleep 1

ESP="${LOOP}p1"
if ! sudo blkid "${ESP}" | grep -q 'TYPE="vfat"'; then
    echo "ERROR: ${ESP} is not vfat. BIB partition layout may have changed."
    sudo blkid "${LOOP}"*
    exit 1
fi

mkdir -p "${WORK}/mnt"
sudo mount "${ESP}" "${WORK}/mnt"

sudo mkdir -p "${WORK}/mnt/rocknix_abl"
# One image serves all devices, so stage a self-contained folder per SoC.
# vfat has no Unix ownership, so `cp -a` would error on chown under set -e.
ABL_SRC=$(ls -d "${WORK}/abl-extracted"/rocknix-abl-*)
sudo cp "${REPO_ROOT}/abl/README" "${WORK}/mnt/rocknix_abl/README"
for soc in SM8550 SM8650 SM8750; do
    d="${WORK}/mnt/rocknix_abl/${soc}"
    sudo mkdir -p "$d"
    sudo cp "${ABL_SRC}/abl_signed-${soc}.elf" "${ABL_SRC}/abl_signed-${soc}.elf.sha256" "$d/"
    for s in flash_abl backup_abl restore_backup_abl; do
        sed "s/%DEVICE%/${soc}/g" "${REPO_ROOT}/abl/${s}.sh.template" \
            | sudo tee "$d/${s}.sh" >/dev/null
    done
    sudo chmod 0755 "$d"/*.sh
done

# Disable GRUB so ABL falls through to /KERNEL.
if [ -d "${WORK}/mnt/EFI" ]; then sudo mv "${WORK}/mnt/EFI" "${WORK}/mnt/EFI.disabled"; fi

sudo sync
sudo umount "${WORK}/mnt"

# Android mounts Microsoft basic data; ROCKNIX ABL still reads plain FAT.
sudo sfdisk --part-type "${LOOP}" 1 EBD0A0A2-B9E5-4433-87C0-68B6B72699C7

sudo losetup -d "${LOOP}"
rm "${WORK}/loop"

GZIP_LEVEL="${GZIP_LEVEL:-6}"
mkdir -p "$(dirname "${OUT}")"
pigz -f "-${GZIP_LEVEL}" -p "$(nproc)" -c "${RAW_IMAGE}" > "${OUT}"
rm -f "${RAW_IMAGE}"

echo "Built: ${OUT}"
echo "Flash to SD with:  zcat ${OUT} | sudo dd of=/dev/sdX bs=4M conv=fsync status=progress"
