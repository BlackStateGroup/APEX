/* Independent assertions using baseline setup helpers, not copied transport logic. */
#define main baseline_main
#include "../../tests/esp32-host/harness.c"
#undef main
int main(void) {
    uint8_t b[524]; size_t n;
    fresh(1); for(unsigned i=0;i<20;i++) request(b+12*i,(uint16_t)(i+1),0);
    term_rc=99; int rc=write_bytes(b,240);
    CHECK(rc==0&&term_calls==16&&count==4&&subscribed);
    drain(); CHECK(delivered_len==48);
    printf("overflow: ATT=%d requests=20 delivered=4 dropped=16 terminate_calls=%u subscribed=%d\n",rc,term_calls,subscribed);
    fresh(1); n=request(b,11,0); CHECK(write_bytes(b,n)==0); notify_rc=1;term_rc=99;
    for(unsigned i=0;i<10;i++)tick();
    CHECK(count==1&&retries==10&&!tx_timer.pending&&subscribed);
    notify_rc=0; CHECK(write_bytes(b,n)==0&&count==2&&!tx_timer.pending);
    printf("retry: failures=%u queued=%u timer=%d subscribed=%d termination=%u\n",retries,count,tx_timer.pending,subscribed,term_calls);
    fresh(1); n=request(b,12,30); CHECK(write_bytes(b,n)==0); tick();
    CHECK(write_bytes(b,5)==0&&peer.stream.used==5); subscribe(7,1);
    CHECK(peer.stream.used==0&&count==1&&queue[first].length==9); drain();
    CHECK(delivered_len==29&&!memcmp(delivered+20,"AXP_READY",9));
    printf("repeat subscription: response_prefix=20 replacement_READY=9 partial_input=0\n");
    fresh(0); subscribe(7,1); for(unsigned i=0;i<4;i++) request(b+12*i,(uint16_t)(i+1),0);
    CHECK(write_bytes(b,48)==0&&count==4&&term_calls==1);drain();CHECK(delivered_len==45);
    printf("pending READY: slots=4 requests=4 responses=3 marker=9 dropped=1\n");
    /* A successful terminate request is asynchronous: no cleanup until GAP callback. */
    fresh(1); for(unsigned i=0;i<5;i++)request(b+12*i,(uint16_t)(i+1),0);
    term_rc=0; CHECK(write_bytes(b,60)==0&&subscribed&&count==4&&term_calls==1);
    struct ble_gap_event e={.type=BLE_GAP_EVENT_DISCONNECT};gap_event(&e,NULL);
    CHECK(!subscribed&&!count&&!tx_timer.pending&&allocations==frees);
    printf("successful terminate request: cleanup occurs only after injected disconnect\n");
    return 0;
}
