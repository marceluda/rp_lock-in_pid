# -*- coding: utf-8 -*-
"""
This file helps to create Verilog code for muxers.
"""

#%%

wire=False
N=3

if wire:
    txt='module muxer{:d} #(\n'.format(N)
    txt+='   parameter     RES = 14 \n'
    txt+=')\n'
    txt+='(\n'
    txt+='   // input\n'
    txt+='   input      [  {:d}-1: 0] sel,             // Select wire 0-{:d}\n'.format(N,2**N-1)

    for i in range(2**N):
        txt+='   input      [RES-1: 0] in{:},\n'.format(i)

    txt+='\n   // output\n'
    txt+='   output      [RES-1: 0] out                // output data\n'
    txt+=');\n\n\n'


    txt+='wire '
    for i in range(2**N):
        txt+='ensel{:<2d}'.format(i)
        if i<2**N-1:
            txt+=','
        else:
            txt+=';\n'
        if mod(i,8)==7:
            txt+='\n     '
    txt+='\n\n'


    for i in range(2**N):
        txt+='''assign ensel{:<2} = (sel=={:d}'d{:<2d});\n'''.format(i,N,i);

    txt+='\n\n'

    for i in range(2**N):
        txt+='wire [RES-1: 0] en{:<2d};\n'.format(i);

    txt+='\n\n'


    for i in range(2**N):
        txt+='assign en{:<2d} = {{RES{{ ensel{:<2d} }}}} & in{:<2d} ;\n'.format(i,i,i);

    txt+='\n\n'

    txt+='assign  out = '

    for i in range(2**N):
        txt+='en{:<2d}'.format(i)
        if i<2**N-1:
            txt+='|'
        else:
            txt+=';\n'
        if mod(i,8)==7:
            txt+='\n              '


    txt+='\n\nendmodule\n\n'

    txt+='/*\n'
    txt+='muxer{:<2d} #( .RES ( 14 ) ) NOMBRE (\n'.format(N)
    txt+='    // input\n'
    txt+='    .sel (  sel  ), // select cable\n'
    for i in range(2**N):
        txt+='''    .in{:<2d} ( 14'b0 ), // in{:<2d}\n'''.format(i,i)
    txt+='    // output\n'
    txt+='    .out ( out   )\n'
    txt+=');\n*/\n'

else:

    txt='module muxer_reg{:d} #(\n'.format(N)
    txt+='   parameter     RES = 14 \n'
    txt+=')\n'
    txt+='(\n'
    txt+='   // input\n'
    txt+='   input                 clk,rst,\n'
    txt+='   input      [  {:d}-1: 0] sel,             // Select wire 0-{:d}\n'.format(N,2**N-1)

    for i in range(2**N):
        txt+='   input      [RES-1: 0] in{:},\n'.format(i)

    txt+='\n   // output\n'
    txt+='   output reg [RES-1: 0] out                // output data\n'
    txt+=');\n\n\n'


    txt+='// switch\n'
    txt+='always @(posedge clk)\n'
    txt+=' '*3+'if (rst)\n'
    txt+=' '*6+"out      <=  {:2>d}'b0; \n".format(N)
    txt+=' '*3+'else\n'
    txt+=' '*6+'case (sel)\n'
    for i in range(2**N):
        txt+=' '*9+"{:d}'d{:02d}   :  out  <= in{:<2d} ;\n".format(N,i,i)
    txt+=' '*9+"default :  out  <= {:2>d}'b0 ; \n".format(N)
    txt+=' '*6+'endcase ;\n'
    txt+=' '*3+'\n'
    txt+=' '+'\n'


    txt+='\n\nendmodule\n\n'

    txt+='/*\n'
    txt+='muxer_reg{:<2d} #( .RES ( 14 ) ) i_muxer_reg{:d}_NOMBRE (\n'.format(N,N)
    txt+='    // input\n'
    txt+='   .clk(clk),.rst(rst),'
    txt+='    .sel (  sel  ), // select cable\n'
    for i in range(2**N):
        txt+='''    .in{:<2d} ( 14'b0 ), // in{:<2d}\n'''.format(i,i)
    txt+='    // output\n'
    txt+='    .out ( out   )\n'
    txt+=');\n*/\n'


print(txt)
