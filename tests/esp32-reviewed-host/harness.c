#include <stdio.h>
#include "../../firmware/esp32s3-reviewed/main/ble_accessory.c"
static unsigned tests;
#define CHECK(x) do { if(!(x)){fprintf(stderr,"FAIL %s:%d: %s\n",__FILE__,__LINE__,#x);exit(1);} }while(0)
#define PASS(s) do {tests++;printf("PASS %s\n",s);}while(0)
static void tick(void){CHECK(tx_timer.pending);tx_timer.pending=0;transmit(NULL);}
static void drain(void){unsigned n=0;while(tx_timer.pending){CHECK(++n<1000);tick();}}
static void subscribe(uint16_t c,int enabled){struct ble_gap_event e={.type=BLE_GAP_EVENT_SUBSCRIBE,.subscribe={c,42,enabled}};gap_event(&e,NULL);}
static void connect(uint16_t c){struct ble_gap_event e={.type=BLE_GAP_EVENT_CONNECT,.connect={0,c}};gap_event(&e,NULL);}
static void disconnect(uint16_t c){struct ble_gap_event e={.type=BLE_GAP_EVENT_DISCONNECT,.disconnect={{c}}};gap_event(&e,NULL);}
static void fresh(int ready){
    CHECK(allocations==frees);reset_peer();connection=BLE_HS_CONN_HANDLE_NONE;
    term_calls=notify_calls=allocations=frees=schedules=adv_calls=0;
    term_rc=notify_rc=alloc_fail=flatten_fail=timer_rc=0;fake_mtu=23;delivered_len=chunks_len=0;
    notify_handle=42;connect(7);
    if(ready){subscribe(7,1);drain();delivered_len=chunks_len=0;}
}
static size_t request(uint8_t *b,uint16_t id,size_t n){
    apex_frame_t f={.kind=APEX_REQUEST,.opcode=3,.id=id,.length=(uint16_t)n};
    for(size_t i=0;i<n;i++)f.payload[i]=(uint8_t)i;
    return apex_encode(&f,b,524);
}
static int write_as(uint16_t c,const uint8_t *b,size_t n,int op){
    struct os_mbuf m={.len=(uint16_t)n};CHECK(n<=sizeof(m.bytes));memcpy(m.bytes,b,n);
    struct ble_gatt_access_ctxt a={.op=op,.om=&m};return access_characteristic(c,0,&a,NULL);
}
static int write_bytes(const uint8_t *b,size_t n){return write_as(7,b,n,2);}
static void send_frame(const uint8_t *b,size_t n){while(n){size_t k=n>244?244:n;CHECK(write_bytes(b,k)==0);b+=k;n-=k;}}
static void expected_ping(uint8_t *b,size_t n){b[3]=APEX_RESPONSE;uint16_t crc=apex_crc16(b,n-2);b[n-2]=(uint8_t)crc;b[n-1]=(uint8_t)(crc>>8);}
static void check_fenced(void){CHECK(fenced&&!subscribed&&!count&&!tx_timer.pending);uint8_t b[524];size_t n=request(b,1,0);CHECK(write_bytes(b,n)==3);subscribe(7,1);CHECK(fenced&&!subscribed&&!tx_timer.pending);transmit(NULL);}
int main(void){
    uint8_t b[524],expected[524];size_t n;
    fresh(0);n=request(b,1,0);CHECK(write_bytes(b,n)==3);subscribe(9,1);CHECK(!subscribed);
    subscribe(7,1);drain();CHECK(delivered_len==9&&!memcmp(delivered,"AXP_READY",9));
    CHECK(write_as(8,b,n,2)==3&&write_as(7,b,n,0)==3&&write_bytes(b,0)==13&&write_bytes(b,245)==13);
    flatten_fail=1;CHECK(write_bytes(b,n)==14&&!count&&!peer.stream.used);PASS("readiness owner bounds and flatten rejection");
    fresh(1);n=request(b,1,33);CHECK(write_bytes(b,5)==0&&peer.stream.used==5);
    CHECK(peer.stream.context==&peer&&peer.output==NULL);CHECK(write_bytes(b+5,n-5)==0&&count==1);
    memcpy(expected,b,n);expected_ping(expected,n);drain();CHECK(delivered_len==n&&!memcmp(delivered,expected,n));
    PASS("partial input commit repairs embedded parser context and real core dispatch");
    fresh(1);for(unsigned i=0;i<20;i++)request(b+i*12,(uint16_t)(i+1),0);
    apex_device_t before=peer;unsigned old_schedules=schedules;
    CHECK(write_bytes(b,240)==17&&count==0&&!term_calls&&!memcmp(&before,&peer,sizeof(peer))&&schedules==old_schedules);
    CHECK(write_bytes(b,48)==0&&count==4);CHECK(write_bytes(b+48,12)==17&&count==4);drain();
    CHECK(write_bytes(b+48,12)==0);drain();CHECK(delivered_len==60);
    PASS("atomic oversized burst rejection and full queue retry after drain");
    fresh(0);subscribe(7,1);for(unsigned i=0;i<4;i++)request(b+i*12,(uint16_t)(i+1),0);
    CHECK(write_bytes(b,48)==17&&count==1);drain();CHECK(write_bytes(b,48)==0);drain();CHECK(delivered_len==57);
    PASS("pending READY reserves capacity without partially admitting burst");
    fresh(1);n=request(b,1,33);CHECK(write_bytes(b,5)==0);uint8_t small[524];size_t sn=request(small,2,0);
    /* Finish first partial, then queue three more while preserving ring state. */
    CHECK(write_bytes(b+5,n-5)==0);for(unsigned i=0;i<3;i++)CHECK(write_bytes(small,sn)==0);
    CHECK(write_bytes(b,5)==0);before=peer;unsigned old_first=first;
    CHECK(write_bytes(b+5,n-5)==17&&!memcmp(&before,&peer,sizeof(peer))&&first==old_first&&count==4);
    drain();CHECK(write_bytes(b+5,n-5)==0);CHECK(peer.stream.used==0);drain();
    CHECK(delivered_len==n*2+sn*3);PASS("full queue admits incomplete prefix but rejected completion preserves parser for retry");
    for(unsigned mtu=23;mtu<=517;mtu+=494){
        fresh(1);fake_mtu=(uint16_t)mtu;n=request(b,3,512);send_frame(b,n);
        memcpy(expected,b,n);expected_ping(expected,n);drain();
        CHECK(delivered_len==524&&!memcmp(delivered,expected,524)&&chunks_len==(mtu==23?27:3));
    }PASS("maximum response MTU fragmentation and queue bytes");
    for(unsigned mtu=0;mtu<23;mtu++){fresh(1);n=request(b,1,0);CHECK(write_bytes(b,n)==0);fake_mtu=(uint16_t)mtu;tick();check_fenced();CHECK(term_calls==1);}
    PASS("all invalid MTU values 0 through 22 fence");
    for(unsigned failure=0;failure<2;failure++)for(unsigned terminate=0;terminate<2;terminate++){
        fresh(1);n=request(b,1,40);CHECK(write_bytes(b,n)==0);term_rc=(int)terminate;
        if(failure)alloc_fail=1;else notify_rc=1;
        for(unsigned i=0;i<10;i++)tick();check_fenced();CHECK(term_calls==1&&allocations==frees);
        disconnect(7);CHECK(!fenced&&connection==65535);connect(8);subscribe(8,1);alloc_fail=notify_rc=0;drain();
        CHECK(delivered_len==9);
    }PASS("ten allocation or notification failures fence despite terminate success or failure; new connection recovers");
    fresh(1);n=request(b,1,40);CHECK(write_bytes(b,n)==0);alloc_fail=1;
    for(unsigned i=0;i<9;i++)tick();CHECK(retries==9&&queue[first].offset==0);
    alloc_fail=0;tick();CHECK(retries==0&&queue[first].offset==20);notify_rc=1;tick();CHECK(queue[first].offset==20);
    notify_rc=0;drain();memcpy(expected,b,n);expected_ping(expected,n);CHECK(delivered_len==n&&!memcmp(expected,delivered,n)&&allocations==frees);
    PASS("retry offset and success reset under fake consume-on-error contract");
    fresh(1);n=request(b,1,40);CHECK(write_bytes(b,n)==0);tick();CHECK(write_bytes(b,5)==0);
    unsigned saved_count=count;size_t saved_offset=queue[first].offset;before=peer;
    subscribe(7,1);CHECK(count==saved_count&&queue[first].offset==saved_offset&&!memcmp(&before,&peer,sizeof(peer)));
    drain();memcpy(expected,b,n);expected_ping(expected,n);CHECK(delivered_len==n&&!memcmp(expected,delivered,n));
    subscribe(7,0);check_fenced();disconnect(9);check_fenced();disconnect(7);CHECK(!fenced&&!peer.stream.used&&connection==65535);
    PASS("repeated enable preserves parser and response; disable fences until owner disconnect");
    fresh(1);n=request(b,1,40);CHECK(write_bytes(b,n)==0);before=peer;
    connect(7);connect(8);disconnect(8);subscribe(8,0);CHECK(connection==7&&subscribed&&count==1&&!memcmp(&before,&peer,sizeof(peer))&&term_calls==1);
    struct ble_gap_event failed={.type=BLE_GAP_EVENT_CONNECT,.connect={1,9}};gap_event(&failed,NULL);
    struct ble_gap_event adv={.type=BLE_GAP_EVENT_ADV_COMPLETE};gap_event(&adv,NULL);
    CHECK(connection==7&&count==1&&!adv_calls);disconnect(7);transmit(NULL);CHECK(!count&&!tx_timer.pending);
    PASS("foreign duplicate failed and stale nonowner callbacks preserve owner");
    fresh(0);timer_rc=1;subscribe(7,1);check_fenced();CHECK(term_calls==1);PASS("READY scheduling failure fences");
    fresh(1);timer_rc=1;n=request(b,1,0);CHECK(write_bytes(b,n)==14);check_fenced();PASS("admission scheduling failure reports ATT error and fences");
    fresh(1);n=request(b,1,40);CHECK(write_bytes(b,n)==0);timer_rc=1;notify_rc=1;tick();check_fenced();PASS("retry scheduling failure fences");
    fresh(1);n=request(b,1,40);CHECK(write_bytes(b,n)==0);timer_rc=1;tick();CHECK(delivered_len==20);check_fenced();PASS("fragment continuation scheduling failure fences");
    fresh(1);uint8_t junk[244];memset(junk,255,sizeof(junk));for(unsigned i=0;i<100;i++)CHECK(write_bytes(junk,244)==0);
    CHECK(peer.stream.used<=1);n=request(b,1,512);b[523]^=1;send_frame(b,n);CHECK(!count);n=request(b,2,0);CHECK(write_bytes(b,n)==0);drain();CHECK(delivered_len==12);
    PASS("malformed maximum frame and long garbage remain bounded and recover");
    fresh(0);nvs_calls=erase_calls=startup_calls=0;
    for(int code=1;code<=3;code++){nvs_result=code;if(setjmp(startup_jump)==0){apex_ble_start();CHECK(0);}CHECK(!erase_calls&&!startup_calls);}
    CHECK(nvs_calls==3);nvs_result=0;apex_ble_start();CHECK(nvs_calls==4&&startup_calls==2&&!erase_calls&&!adv_calls);
    CHECK(ble_hs_cfg.sync_cb==synchronised);PASS("fully stubbed opt-in startup errors never erase or start host; successful initialization registers callbacks");

    /* Both pinned allocation and timer-creation failures return the same -1.
     * Inject that public result, not a fake implementation of SDK allocation. */
    fresh(0);nvs_result=0;callout_init_result=-1;
    callout_init_calls=host_start_calls=0;
    if(setjmp(startup_jump)==0){apex_ble_start();CHECK(0);}
    CHECK(callout_init_calls==1&&host_start_calls==0&&!erase_calls&&!adv_calls);
    callout_init_result=0;host_start_calls=0;apex_ble_start();CHECK(host_start_calls==1);
    PASS("callout allocation/timer failure return stops before host task start");

    fresh(1);unsigned seed=0x415850;
    for(unsigned i=0;i<10000;i++){
        seed=seed*1664525u+1013904223u;
        switch((seed>>16)%10){
        case 0: n=request(b,(uint16_t)(i+1),seed%200);{int rc=write_bytes(b,n);CHECK(rc==0||rc==3||rc==14||rc==17);}break;
        case 1: if(tx_timer.pending)tick();break;
        case 2: subscribe(7,1);break;
        case 3: subscribe(7,0);break;
        case 4: notify_rc=(int)(seed&1);break;
        case 5: alloc_fail=(int)(seed&1);break;
        case 6: disconnect(7);connect(7);break;
        case 7: timer_rc=(int)(seed&1);break;
        case 8: term_rc=(int)(seed&1);break;
        default: fake_mtu=(seed&1)?23:517;break;
        }
        CHECK(count<=4&&first<4&&peer.stream.used<=524&&allocations==frees&&peer.stream.context==&peer);
        if(fenced)CHECK(!count&&!subscribed&&!tx_timer.pending);
        for(unsigned j=0;j<count;j++){unsigned k=(first+j)%4;CHECK(queue[k].offset<=queue[k].length&&queue[k].length<=524);}
        delivered_len=chunks_len=0;
    }
    PASS("10000 deterministic revised callback and injected-failure interleavings preserve bounds");
    printf("RESULT %u revised scenarios passed\n",tests);return 0;
}
