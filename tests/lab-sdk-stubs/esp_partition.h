#include <stddef.h>
#include <stdbool.h>
#define ESP_OK 0
#define ESP_PARTITION_TYPE_DATA 1
typedef struct { bool readonly; size_t size; } esp_partition_t;
const esp_partition_t *esp_partition_find_first(int type, int subtype, const char *label);
int esp_partition_read(const esp_partition_t *partition, size_t offset, void *output, size_t size);
