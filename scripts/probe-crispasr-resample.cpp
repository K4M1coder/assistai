// Standalone signal check against the pinned CrispASR resampler source.
#include "core/audio_resample.h"
#include <cmath>
#include <cstdio>
#include <vector>

int main() {
    constexpr int input_rate = 16000, output_rate = 24000, frequency = 440;
    constexpr double pi = 3.14159265358979323846;
    std::vector<float> input(input_rate);
    for (int i = 0; i < input_rate; ++i)
        input[i] = static_cast<float>(0.5 * std::sin(2.0 * pi * frequency * i / input_rate));
    auto output = core_audio::resample_polyphase(input.data(), static_cast<int>(input.size()), input_rate, output_rate);
    if (output.size() != output_rate) return 1;
    double sum_sq = 0.0;
    int crossings = 0;
    for (size_t i = 1; i < output.size(); ++i) {
        sum_sq += output[i] * output[i];
        if (output[i - 1] <= 0 && output[i] > 0) ++crossings;
    }
    const double rms = std::sqrt(sum_sq / output.size());
    std::printf("input_samples=%zu output_samples=%zu zero_crossings=%d rms=%.6f\n", input.size(), output.size(), crossings, rms);
    return crossings >= 439 && crossings <= 441 && rms > 0.34 && rms < 0.37 ? 0 : 2;
}
