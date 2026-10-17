# User Requests

## UR-001
- Timestamp: 2026-07-17 14:11
- Source: user
- Text (verbatim): "DST-обвязка CLI-хендлеров config --set и status -d: DstIO-шов + детерминированные тесты"
- Superseded by: UR-002

## UR-002
- Timestamp: 2026-07-17 14:11
- Source: user
- Text (verbatim): "Добавить подготовку и проверку по DST для новых CLI-хендлеров TASK-034 (config --set, status -d/--recursive) и сделать обвязку тестами: посадить IO-пути на DstIO-шов (паттерн DependencyManager: опциональный dstIO с fallback на реальную fs), детерминированные тесты на MockDstIO (seeded in-memory fs), закрыть DST-debt из TASK-034/ISS-018 в части этих хендлеров (CD-63)"
