Petkit Homebridge Plugin
========================

<p align="center">
    <img src="https://github.com/jubepue/homebridge-petkit-platform/blob/master/images/homebridge-petkit-platform.png"><br>
</p>

<span align="center">
    
[![npm](https://img.shields.io/npm/v/homebridge-petkit-platform.svg)](https://www.npmjs.com/package/homebridge-petkit-platform)
[![npm](https://img.shields.io/npm/dt/homebridge-petkit-platform.svg)](https://www.npmjs.com/package/homebridge-petkit-platform)
[![verified-by-homebridge](https://badgen.net/badge/homebridge/verified/purple)](https://github.com/homebridge/homebridge/wiki/Verified-Plugins)
    
[![GitHub watchers](https://img.shields.io/github/watchers/jubepue/homebridge-petkit-platform.svg?style=social&label=Watch)](https://GitHub.com/jubepue/homebridge-petkit-platform/watchers/)
[![GitHub stars](https://img.shields.io/github/stars/jubepue/homebridge-petkit-platform.svg?style=social&label=Star)](https://GitHub.com/jubepue/homebridge-petkit-platform/stargazers/)
[![GitHub forks](https://img.shields.io/github/forks/jubepue/homebridge-petkit-platform.svg?style=social&label=Fork)](https://GitHub.com/jubepue/homebridge-petkit-platform/network/)

If you like Petkit Homebridge Plugin - give it a star, or fork it and contribute!

</span>

Homebridge custom plugin for controlling Petkit feeders in HomeKit.

## Supported devices

| Model | API type | Portion sizes |
| ----- | -------- | ------------- |
| Fresh Element | `Feeder` | 5–50g in 5g steps |
| Fresh Element Mini | `FeederMini` | 5–50g in 5g steps |
| Fresh Element Infinity | `D3` | 5–50g in 5g steps |
| Fresh Element Solo | `D4` | 10–50g in 10g steps |
| YumShare Solo | `D4H` | 10–50g in 10g steps |
| Fresh Element Gemini | `D4s` | unverified (treated as 5g steps; limited) |
| YumShare Dual-Hopper | `D4SH` | unverified (treated as 5g steps; limited) |

**Limited support:** dual-hopper models (`D4s`, `D4SH`) are recognized and can call the same dispense API, but hopper selection is not exposed in HomeKit. Which hopper feeds, and whether portion steps match 5g, have not been verified against the Petkit app — treat as experimental.

### Feeding in HomeKit

Set the accessory fan speed, then toggle **Food Dispenser**. Default fan speed is **40% → 20g** (configurable).

- **D4 / D4H:** fan steps of 20% → 10 / 20 / 30 / 40 / 50g
- **Feeder / FeederMini / D3 / D4s / D4SH:** fan steps of 10% → 5 / 10 / 15 / … / 50g (`grams = floor(speed% / 10) × 5`)

Devices that disappear from the Petkit account are **not** removed from HomeKit automatically (so scenes/automations keep working). Remove stale accessories manually in the Home app if needed.

## Preparation
  1. [Use the Petkit Homebridge Plugin](https://github.com/jubepue/homebridge-petkit-platform/wiki/How-to-Use-Petkit-Homebridge-Plugin)
  2. [How to Get Logs](https://github.com/jubepue/homebridge-petkit-platform/wiki/How-To-Get-Logs)

## Set up the development environment

```
—-VSCode
—-engines
    "node": “>=0.12.0”
    "homebridge": ">=0.2.0"
—-dependencies
    "axios": “^0.21.1",
    "crypto-js": “^4.0.0”,
    "qs": "^6.11.0"
```

## Feedback

You can use the **GitHub Issue** to provide feedback on any problems you encounter.

## LICENSE

For more information, see the [LICENSE](LICENSE) file.
