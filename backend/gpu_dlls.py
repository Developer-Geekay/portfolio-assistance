# gpu_dlls.py — Windows DLL search path setup for pip-installed CUDA libs.
# nvidia-cuda-runtime-cu12 / nvidia-cublas-cu12 / nvidia-cudnn-cu12 unpack
# their DLLs into site-packages/nvidia/*/bin, which native libs (llama.cpp,
# ctranslate2) cannot see without explicit registration. Must run BEFORE
# importing llama_cpp or faster_whisper.
import glob
import os
import site
import sys


def register_cuda_dlls():
    """No-op outside Windows; safe to call repeatedly."""
    if sys.platform != "win32":
        return
    for base in site.getsitepackages():
        for bin_dir in glob.glob(os.path.join(base, "nvidia", "*", "bin")):
            os.add_dll_directory(bin_dir)
            if bin_dir not in os.environ.get("PATH", ""):
                os.environ["PATH"] = bin_dir + os.pathsep + os.environ["PATH"]
