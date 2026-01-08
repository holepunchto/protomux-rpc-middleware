#!/usr/bin/bash

NS1=test-net-1
NS2=test-net-2
BR=test-bridge

ip netns del test-net-1
ip netns del test-net-2
ip link del test-bridge