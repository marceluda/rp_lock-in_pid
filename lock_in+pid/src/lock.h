/**
 * @brief Red Pitaya LOCK Controller
 *
 * @Author Marcelo Luda <marceluda@gmail.com>
 *
 *
 *
 * This part of code is written in C programming language.
 * Please visit http://en.wikipedia.org/wiki/C_(programming_language)
 * for more details on the language used herein.
 */

#ifndef __LOCK_H
#define __LOCK_H

#include "main.h"

int lock_init(void);
int lock_exit(void);

int lock_update(rp_app_params_t *params);
int lock_update_main(rp_app_params_t *params);

int lock_freeze_regs(void);
int lock_restore_regs(void);

extern int save_read_ctrl ;


#endif // __LOCK_H
