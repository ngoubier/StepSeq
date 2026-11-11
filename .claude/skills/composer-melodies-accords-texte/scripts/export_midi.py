#!/usr/bin/env python3
"""Validate exact monophonic timing and optionally export a type-0 MIDI. Stdlib only."""
import argparse
import json
import math
import struct
from fractions import Fraction as F
from pathlib import Path

PPQ = 960


def integer(value, low, high):
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f'Expected integer {low}..{high}, got {value!r}')
    return value


def ticks(value):
    value = F(str(value)) * PPQ
    if value.denominator != 1:
        raise ValueError('Timing cannot be represented exactly at 960 PPQ')
    return int(value)


def validate(data):
    num, den = data['time_signature']
    integer(num, 1, 255)
    integer(den, 1, 128)
    if den & (den - 1):
        raise ValueError('Time-signature denominator must be a power of two')
    bars = integer(data['bars'], 1, 100000)
    bpm = data.get('bpm', 90)
    if isinstance(bpm, bool) or not isinstance(bpm, (float, int)) or not math.isfinite(bpm) or not 4 <= bpm <= 1000:
        raise ValueError('bpm must be a finite quarter-note tempo in 4..1000')
    end = F(bars * num * 4, den)
    cursor = F(0)
    attacks = [0] * bars
    for event in data['events']:
        start, duration = F(str(event['start'])), F(str(event['duration']))
        if start != cursor or duration <= 0:
            raise ValueError(f'Gap, overlap or nonpositive duration at {start}; expected {cursor}')
        cursor = start + duration
        if cursor > end:
            raise ValueError('Event exceeds declared duration')
        ticks(start)
        ticks(duration)
        note = event.get('note')
        if note is not None:
            integer(note, 0, 127)
            integer(event.get('velocity', 80), 1, 127)
            attacks[int(start // F(num * 4, den))] += 1
        elif event.get('syllable'):
            raise ValueError('A rest cannot carry a sung syllable')
    if cursor != end:
        raise ValueError(f'Incomplete phrase: {cursor} instead of {end} quarter notes')
    expected = data.get('attacks_per_bar')
    if expected is not None and expected != attacks:
        raise ValueError(f'Attacks per bar: {attacks}, expected {expected}')
    return end, attacks


def vlq(number):
    if not 0 <= number <= 0x0FFFFFFF:
        raise ValueError('MIDI delta time out of range')
    result = [number & 127]
    number >>= 7
    while number:
        result.insert(0, (number & 127) | 128)
        number >>= 7
    return bytes(result)


def meta(kind, payload):
    return bytes([255, kind]) + vlq(len(payload)) + payload


def export(data, output):
    end, attacks = validate(data)
    num, den = data['time_signature']
    tempo = round(60000000 / data.get('bpm', 90))
    events = [(0, -3, meta(0x51, tempo.to_bytes(3, 'big'))),
              (0, -2, meta(0x58, bytes([num, den.bit_length()-1, 24, 8]))),
              (0, -1, meta(3, b'Melody'))]
    for event in data['events']:
        note = event.get('note')
        if note is None:
            continue
        start = ticks(event['start'])
        stop = start + ticks(event['duration'])
        if event.get('syllable'):
            events.append((start, 1, meta(5, event['syllable'].encode('utf-8'))))
        events.extend([(start, 2, bytes([0x90, note, event.get('velocity', 80)])),
                       (stop, 0, bytes([0x80, note, 0]))])
    events.append((ticks(end), 3, meta(0x2F, b'')))
    previous, track = 0, bytearray()
    for time, priority, payload in sorted(events, key=lambda item: (item[0], item[1])):
        track.extend(vlq(time-previous) + payload)
        previous = time
    Path(output).write_bytes(b'MThd' + struct.pack('>IHHH', 6, 0, 1, PPQ) + b'MTrk' + struct.pack('>I', len(track)) + track)
    return attacks


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input', type=Path)
    parser.add_argument('output', nargs='?')
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding='utf-8'))
    if args.output:
        attacks = export(data, args.output)
        print(f'MIDI exported; attacks per bar: {attacks}')
    else:
        end, attacks = validate(data)
        print(f'Valid timing: {end} quarter notes; attacks per bar: {attacks}')
