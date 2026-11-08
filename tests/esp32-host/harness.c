#include <stdio.h>
/* Include the original translation unit, giving tests access to static callbacks.
 * No queue/parser logic is reproduced here. Link the real apex.c separately. */
#include "../../firmware/esp32s3/main/ble_accessory.c"
static unsigned tests;
#define CHECK(x) do { if(!(x)){fprintf(stderr,"FAIL %s:%d: %s\n",__FILE__,__LINE__,#x);exit(1);} }while(0)
#define PASS(s) do {tests++;printf("PASS %s\n",s);}while(0)
static void tick(void){CHECK(tx_timer.pending);tx_timer.pending=0;transmit(NULL);}
static void drain(void){unsigned n=0;while(tx_timer.pending){CHECK(++n<1000);tick();}}
static void subscribe(uint16_t c,int enabled){
    struct ble_gap_event e={.type=BLE_GAP_EVENT_SUBSCRIBE,.subscribe={c,42,enabled}};gap_event(&e,NULL);
}
static void connect(uint16_t c){
    struct ble_gap_event e={.type=BLE_GAP_EVENT_CONNECT,.connect={0,c}};gap_event(&e,NULL);
}
static void fresh(int ready){
    CHECK(allocations==frees);memset(&tx_timer,0,sizeof(tx_timer));
    term_calls=notify_calls=allocations=frees=schedules=adv_calls=0;
    term_rc=notify_rc=alloc_fail=flatten_fail=0;fake_mtu=23;delivered_len=chunks_len=0;
    notify_handle=42;apex_device_init(&peer,output,NULL);connect(7);
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
static int write_bytes(const uint8_t *b,size_t n){return write_as(7,b,n,BLE_GATT_ACCESS_OP_WRITE_CHR);}
static void send_frame(const uint8_t *b,size_t n){
    while(n){size_t k=n>244?244:n;CHECK(write_bytes(b,k)==0);b+=k;n-=k;}
}
static void expected_ping(uint8_t *b,size_t n){b[3]=APEX_RESPONSE;uint16_t crc=apex_crc16(b,n-2);b[n-2]=(uint8_t)crc;b[n-1]=(uint8_t)(crc>>8);}
int main(int argc,char **argv){
    uint8_t b[524], expected[524];size_t n;
    fresh(0);n=request(b,1,0);CHECK(write_bytes(b,n)==BLE_ATT_ERR_WRITE_NOT_PERMITTED);
    subscribe(9,1);CHECK(!subscribed);subscribe(7,1);CHECK(count==1);drain();
    CHECK(delivered_len==9&&!memcmp(delivered,"AXP_READY",9));PASS("subscription readiness and foreign subscription");
    fresh(1);CHECK(write_as(8,b,n,2)==3);CHECK(write_as(7,b,n,0)==3);
    CHECK(write_bytes(b,0)==13);CHECK(write_bytes(b,245)==13);
    flatten_fail=1;CHECK(write_bytes(b,n)==14);CHECK(!peer.stream.used&&!count);PASS("owner, operation, zero/oversize and flatten rejection");
    fresh(1);n=request(b,2,33);CHECK(write_bytes(b,5)==0);CHECK(!count&&peer.stream.used==5);
    CHECK(write_bytes(b+5,n-5)==0);CHECK(count==1);memcpy(expected,b,n);expected_ping(expected,n);drain();
    CHECK(delivered_len==n&&!memcmp(delivered,expected,n));PASS("partial frame and real parser response");
    for(unsigned mtu=23;mtu<=517;mtu+=494){
        fresh(1);fake_mtu=(uint16_t)mtu;n=request(b,3,512);send_frame(b,n);
        memcpy(expected,b,n);expected_ping(expected,n);drain();
        CHECK(delivered_len==524&&!memcmp(delivered,expected,524));
        CHECK(chunks_len==(mtu==23?27:3));CHECK(chunks[0]==(mtu==23?20:244));
    }PASS("maximum frame fragmentation at MTU 23 and 517");
    fresh(1);for(unsigned i=0;i<4;i++)request(b+12*i,(uint16_t)(i+1),0);
    CHECK(write_bytes(b,48)==0&&count==4&&!term_calls);drain();
    CHECK(delivered_len==48);for(unsigned i=0;i<4;i++)CHECK(delivered[12*i+6]==i+1);
    PASS("four coalesced requests FIFO");
    fresh(1);for(unsigned i=0;i<20;i++)request(b+12*i,(uint16_t)(i+1),0);
    term_rc=99;CHECK(write_bytes(b,240)==0);CHECK(count==4&&term_calls==16&&subscribed);
    if(argc>1&&!strcmp(argv[1],"--require-safe-overflow")){
        CHECK(!subscribed); /* intentionally failing safety requirement against restored source */
    }
    drain();CHECK(delivered_len==48);n=request(b,30,0);CHECK(write_bytes(b,n)==0&&count==1);drain();
    PASS("KNOWN ISSUE overflow ACKs, drops 16 replies, failed termination leaves session open");
    fresh(1);n=request(b,1,0);CHECK(write_bytes(b,n)==0);notify_rc=1;term_rc=99;
    for(unsigned i=0;i<10;i++)tick();
    CHECK(term_calls==1&&retries==10&&count==1&&!tx_timer.pending&&subscribed);
    notify_rc=0;CHECK(write_bytes(b,n)==0&&count==2&&!tx_timer.pending);
    if(argc>1&&!strcmp(argv[1],"--require-safe-retry")){
        CHECK(tx_timer.pending||!subscribed);
    }
    PASS("KNOWN ISSUE failed termination after ten notify errors strands queue and later writes");
    fresh(1);n=request(b,1,40);CHECK(write_bytes(b,n)==0);alloc_fail=1;
    for(unsigned i=0;i<9;i++)tick();CHECK(retries==9&&notify_calls==1&&queue[first].offset==0);
    alloc_fail=0;tick();CHECK(retries==0&&queue[first].offset==20);
    notify_rc=1;tick();CHECK(queue[first].offset==20&&retries==1&&allocations==frees);
    notify_rc=0;drain();memcpy(expected,b,n);expected_ping(expected,n);
    CHECK(delivered_len==n&&!memcmp(delivered,expected,n));PASS("allocation failure, retry offset, ownership and success reset");
    fresh(1);n=request(b,1,30);CHECK(write_bytes(b,n)==0);tick();CHECK(queue[first].offset==20);
    CHECK(write_bytes(b,5)==0);subscribe(7,1);
    CHECK(count==1&&peer.stream.used==0&&queue[first].length==9);drain();
    CHECK(delivered_len==29&&!memcmp(delivered+20,"AXP_READY",9));
    PASS("KNOWN ISSUE repeated subscription discards response tail and parser prefix");
    fresh(1);n=request(b,1,30);CHECK(write_bytes(b,n)==0);CHECK(write_bytes(b,5)==0);
    struct ble_gap_event e={.type=BLE_GAP_EVENT_DISCONNECT};gap_event(&e,NULL);
    CHECK(!count&&!peer.stream.used&&!tx_timer.pending&&!subscribed&&connection==65535&&adv_calls==1);
    transmit(NULL);connect(8);subscribe(7,1);CHECK(!subscribed);subscribe(8,1);drain();
    CHECK(delivered_len==9&&!memcmp(delivered,"AXP_READY",9));PASS("disconnect clears queue/parser/timer and reconnect ownership");
    fresh(1);uint8_t junk[244];memset(junk,255,sizeof(junk));
    for(unsigned i=0;i<100;i++)CHECK(write_bytes(junk,sizeof(junk))==0);
    CHECK(peer.stream.used<=1);n=request(b,1,0);CHECK(write_bytes(b,n)==0);drain();CHECK(delivered_len==12);
    PASS("bounded malformed input and recovery");
    fresh(0);output(b,524,NULL);CHECK(!count);subscribe(7,1);drain();delivered_len=0;
    output(b,0,NULL);output(b,525,NULL);CHECK(!count);
    subscribe(7,0);CHECK(!subscribed&&!count&&!tx_timer.pending);
    CHECK(write_bytes(b,12)==3);PASS("output bounds and unsubscribe");
    
    fresh(0);subscribe(7,1);for(unsigned i=0;i<4;i++)request(b+12*i,(uint16_t)(i+1),0);
    CHECK(write_bytes(b,48)==0&&count==4&&term_calls==1);drain();CHECK(delivered_len==45);
    PASS("KNOWN ISSUE pending READY consumes one of four response slots");
    fresh(1);n=request(b,1,0);CHECK(write_bytes(b,n)==0);alloc_fail=1;
    for(unsigned i=0;i<10;i++)tick();
    CHECK(term_calls==1&&!tx_timer.pending&&retries==10&&count==1);
    PASS("ten allocation failures also stop scheduling");
    fresh(1);n=request(b,1,512);b[523]^=1;send_frame(b,n);CHECK(!count);
    n=request(b,2,0);CHECK(write_bytes(b,n)==0);drain();CHECK(delivered_len==12);
    PASS("bad maximum frame CRC rejected and next request recovered");
    fresh(1);n=request(b,1,0);CHECK(write_bytes(b,n)==0);
    struct ble_gap_event failed={.type=BLE_GAP_EVENT_CONNECT,.connect={1,9}};
    gap_event(&failed,NULL);CHECK(connection==65535&&!subscribed&&!count&&!tx_timer.pending&&adv_calls==1);
    PASS("failed connect clears previous state and invokes only fake advertising");
    fresh(1);unsigned seed=0x415850;
    for(unsigned i=0;i<10000;i++){
        seed=seed*1664525u+1013904223u;
        switch((seed>>16)%8){
        case 0: n=request(b,(uint16_t)(i+1),seed%200);CHECK(write_bytes(b,n)==(subscribed?0:3));break;
        case 1: if(tx_timer.pending)tick();break;
        case 2: subscribe(7,1);break;
        case 3: subscribe(7,0);break;
        case 4: notify_rc=(int)(seed&1);break;
        case 5: alloc_fail=(int)(seed&1);break;
        case 6: reset_peer();break;
        default: fake_mtu=(seed&1)?23:517;break;
        }
        CHECK(count<=4&&first<4&&peer.stream.used<=524&&allocations==frees);
        for(unsigned j=0;j<count;j++){unsigned k=(first+j)%4;CHECK(queue[k].offset<=queue[k].length&&queue[k].length<=524);}
        delivered_len=chunks_len=0;
    }
    PASS("10000 deterministic host callback/failure interleavings preserve bounds");
    CHECK(allocations==frees);printf("RESULT %u scenarios passed (known defects explicitly asserted)\n",tests);return 0;
}
