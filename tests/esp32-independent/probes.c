#include <stdio.h>
/* Actual adapter translation unit; actual core is linked separately. */
#include "../../firmware/esp32s3-reviewed/main/ble_accessory.c"
#define CHECK(x) do { if (!(x)) { fprintf(stderr,"FAIL line %d: %s\n",__LINE__,#x); exit(1); } } while(0)
static unsigned cases;
#define PASS(s) do { ++cases; puts("PASS " s); } while(0)
static void tick(void) { CHECK(tx_timer.pending); tx_timer.pending=0; transmit(NULL); }
static void drain(void) { unsigned i=0; while(tx_timer.pending) { CHECK(++i<1000); tick(); } }
static void sub(int enabled) { struct ble_gap_event e={.type=BLE_GAP_EVENT_SUBSCRIBE,.subscribe={7,42,enabled}}; gap_event(&e,NULL); }
static void fresh(void) {
    CHECK(allocations==frees); connection=BLE_HS_CONN_HANDLE_NONE; reset_peer();
    term_calls=notify_calls=allocations=frees=schedules=adv_calls=0;
    term_rc=notify_rc=alloc_fail=flatten_fail=schedule_rc=0; fake_mtu=23;delivered_len=chunks_len=0;
    notify_handle=42; struct ble_gap_event e={.type=BLE_GAP_EVENT_CONNECT,.connect={0,7}};gap_event(&e,NULL);
    sub(1);drain();delivered_len=chunks_len=0;
}
static int write_bytes(const uint8_t *b,size_t n) {
    struct os_mbuf m={.len=(uint16_t)n}; CHECK(n<=sizeof(m.bytes));memcpy(m.bytes,b,n);
    struct ble_gatt_access_ctxt a={.op=BLE_GATT_ACCESS_OP_WRITE_CHR,.om=&m};return access_characteristic(7,0,&a,NULL);
}
static size_t req(uint8_t *b,unsigned id,size_t payload) {
    apex_frame_t f={.kind=APEX_REQUEST,.opcode=3,.id=(uint16_t)id,.length=(uint16_t)payload};
    for(size_t i=0;i<payload;i++)f.payload[i]=(uint8_t)(i*7+id);
    return apex_encode(&f,b,APEX_MAX_FRAME);
}
static void response(uint8_t *b,size_t n) { b[3]=APEX_RESPONSE;uint16_t c=apex_crc16(b,n-2);b[n-2]=(uint8_t)c;b[n-1]=(uint8_t)(c>>8); }
static void send(const uint8_t *b,size_t n) { while(n) { size_t k=n>244?244:n; CHECK(write_bytes(b,k)==0);n-=k;b+=k; } }
int main(void) {
    uint8_t b[524], expected[4096], burst[244];size_t n;
    /* Capacity x response-count admission matrix: preserve every parser/queue
       byte on failure, then drain and retry the exact rejected bytes. */
    for(unsigned occupied=0;occupied<=4;occupied++)for(unsigned incoming=1;incoming<=20;incoming++) {
        fresh();for(unsigned j=0;j<occupied;j++) { req(b,j+1,0);CHECK(write_bytes(b,12)==0); }
        for(unsigned j=0;j<incoming;j++)req(burst+j*12,j+20,0);
        apex_device_t saved=peer;uint8_t savedq[sizeof(queue)];memcpy(savedq,queue,sizeof(queue));
        unsigned sf=first,sc=count,sr=retries,ss=schedules;int sp=tx_timer.pending;
        int rc=write_bytes(burst,12*incoming);
        if(occupied+incoming>4) {
            CHECK(rc==BLE_ATT_ERR_INSUFFICIENT_RES);CHECK(!memcmp(&peer,&saved,sizeof(peer)));
            CHECK(!memcmp(queue,savedq,sizeof(queue))&&first==sf&&count==sc&&retries==sr&&schedules==ss&&tx_timer.pending==sp);
            drain();if(incoming<=4) { CHECK(write_bytes(burst,12*incoming)==0);drain();CHECK(delivered_len==12*(occupied+incoming)); }
        } else { CHECK(rc==0);drain();CHECK(delivered_len==12*(occupied+incoming)); }
        CHECK(peer.stream.context==&peer&&peer.output==NULL&&allocations==frees);
    }
    PASS("100 capacity/burst combinations: atomic exact-byte rollback and retry");
    /* Partial maximum frame finishing into full queue: retry must deliver once. */
    fresh();n=req(b,200,512);CHECK(write_bytes(b,244)==0);CHECK(write_bytes(b+244,244)==0);
    /* Queue occupation is injected only via legitimate writes BEFORE prefix. */
    fresh();for(unsigned i=0;i<4;i++){req(burst,1+i,0);CHECK(write_bytes(burst,12)==0);}
    CHECK(write_bytes(b,244)==0);CHECK(write_bytes(b+244,244)==0);CHECK(peer.stream.used==488);
    apex_device_t saved=peer;CHECK(write_bytes(b+488,n-488)==17);CHECK(!memcmp(&peer,&saved,sizeof(peer)));
    drain();CHECK(write_bytes(b+488,n-488)==0);drain();response(b,n);CHECK(delivered_len==48+n&&!memcmp(delivered+48,b,n));
    PASS("full queue preserves 488-byte maximum-frame prefix for exact tail retry");
    /* Malformed prefix + too many valid requests + partial suffix must ALL roll back. */
    fresh();CHECK(write_bytes((uint8_t[]){0x41},1)==0);saved=peer;
    memset(burst,0xff,7);for(unsigned i=0;i<5;i++)req(burst+7+i*12,50+i,0);burst[67]=0x41;burst[68]=0x58;
    CHECK(write_bytes(burst,69)==17);CHECK(!memcmp(&peer,&saved,sizeof(peer))&&!count);
    CHECK(write_bytes(burst,55)==0);drain();CHECK(write_bytes(burst+55,14)==0);drain();
    CHECK(delivered_len==60&&peer.stream.used==2&&peer.stream.discarded==8);
    PASS("malformed resync counters and trailing prefix roll back with response overflow");
    /* Wrap first to slot three, then retain partial head while filling wrapped slots. */
    fresh();for(unsigned i=0;i<3;i++){req(b,1+i,0);CHECK(write_bytes(b,12)==0);drain();}
    CHECK(first==0); /* READY consumed slot zero, three responses wrap to zero. */
    req(b,4,0);CHECK(write_bytes(b,12)==0);drain();CHECK(first==1);
    req(b,5,0);CHECK(write_bytes(b,12)==0);drain();req(b,6,0);CHECK(write_bytes(b,12)==0);drain();CHECK(first==3);
    delivered_len=chunks_len=0;n=req(b,100,80);memcpy(expected,b,n);response(expected,n);send(b,n);tick();CHECK(first==3&&queue[3].offset==20);
    for(unsigned i=0;i<3;i++){req(burst+i*12,101+i,0);memcpy(expected+n+i*12,burst+i*12,12);response(expected+n+i*12,12);}
    CHECK(write_bytes(burst,36)==0&&count==4);saved=peer;CHECK(write_bytes(burst,12)==17);CHECK(!memcmp(&peer,&saved,sizeof(peer)));
    sub(1);CHECK(first==3&&queue[3].offset==20&&count==4);drain();CHECK(delivered_len==n+36&&!memcmp(delivered,expected,n+36));
    PASS("wrapped four-slot queue preserves partial head, FIFO and idempotent subscription");
    /* Fail scheduling at READY, write admission, successful chunk, failed notify. */
    for(unsigned mode=0;mode<4;mode++) {
        fresh();term_rc=99;n=req(b,99,80);
        if(mode==0) { reset_peer();schedule_rc=1;sub(1); }
        else if(mode==1){schedule_rc=1;CHECK(write_bytes(b,n)==14);}
        else {CHECK(write_bytes(b,n)==0);schedule_rc=1;notify_rc=mode==3;tick();}
        CHECK(fenced&&!subscribed&&!count&&!tx_timer.pending&&term_calls==1&&connection==7);
        unsigned calls=notify_calls;for(unsigned i=0;i<20;i++){transmit(NULL);sub(1);CHECK(write_bytes(b,n)==3);}
        CHECK(notify_calls==calls&&term_calls==1);
        struct ble_gap_event e={.type=BLE_GAP_EVENT_DISCONNECT,.disconnect={.conn={8}}};gap_event(&e,NULL);CHECK(fenced&&connection==7);
        e.disconnect.conn.conn_handle=7;gap_event(&e,NULL);CHECK(!fenced&&connection==65535&&adv_calls==1);
    }
    PASS("four scheduler failure positions fence before failed terminate and stay fenced");
    for(unsigned failmode=0;failmode<2;failmode++)for(unsigned term=0;term<2;term++) {
        fresh();n=req(b,1,50);CHECK(write_bytes(b,n)==0);tick();CHECK(queue[first].offset==20);
        term_rc=term?99:0;alloc_fail=failmode;notify_rc=!failmode;
        for(unsigned i=0;i<10;i++)tick();CHECK(fenced&&!count&&!tx_timer.pending&&term_calls==1&&allocations==frees);
        sub(0);sub(1);transmit(NULL);CHECK(write_bytes(b,n)==3&&connection==7&&term_calls==1);
    }
    PASS("allocation/notify exhaustion fences on both successful and failed termination requests");
    fresh();n=req(b,1,512);send(b,n);unsigned old=schedules;fake_mtu=22;tick();CHECK(fenced&&!count&&schedules==old&&term_calls==1);
    PASS("invalid MTU fences without allocating or rescheduling");
    /* No extra response generation on an accepted response-kind frame at capacity. */
    fresh();for(unsigned i=0;i<4;i++){req(b,1+i,0);CHECK(write_bytes(b,12)==0);}req(b,8,30);response(b,42);CHECK(write_bytes(b,42)==0&&count==4&&peer.stream.used==0);
    PASS("full output queue still accepts protocol frames generating no responses");
    printf("RESULT %u independent probe groups passed; 100 admission combinations, host doubles only\n",cases);
    printf("HOST_SIZES peer=%zu staging=%zu queue=%zu (not target ABI sizes)\n",sizeof(peer),sizeof(staged),sizeof(queue));
    return 0;
}
